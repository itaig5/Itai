// The engine facade the dashboard, jobs, and HITL workflow call. Wires:
// signals (incl. visibility) -> findings -> rules+bandit policy -> verifier -> store,
// and approval -> push-to-all-channels -> outcome log.
import type { Recommendation, Signals } from '../types.ts';
import type { RevPilotEnv } from '../config/env.ts';
import type { Store } from '../store/store.ts';
import type { ChannelAdapter } from '../adapters/channelAdapter.ts';
import type { VisibilityProviderPort } from '../visibility/provider.ts';
import { BanditClient } from '../learning/banditClient.ts';
import { ForecastClient } from '../learning/forecastClient.ts';
import { candidatesFor } from '../learning/arms.ts';
import { buildContext } from '../learning/featureStore.ts';
import { evaluateFindings, recommendMove } from '../rms/rules.ts';
import { applyBanditArm, assembleRecommendation, candidateSpecFor } from '../rms/policy.ts';
import { verifyRecommendation, type VerifierReport } from '../verifier/verifier.ts';
import { pushToAllChannels, maybeAutoExecute, type PushSummary } from '../orchestrator/orchestrator.ts';
import { buildSignals, buildAllSignals, defaultWindow } from './signalService.ts';

export interface Runtime {
  env: RevPilotEnv;
  store: Store;
  adapter: ChannelAdapter;
  visibility: VisibilityProviderPort;
  bandit: BanditClient;
  forecast: ForecastClient;
}

export interface RecommendationWithReport {
  rec: Recommendation;
  report: VerifierReport;
  signals: Signals;
}

/** Sweep every listing: compute signals, emit at most one new actionable recommendation each.
 *  Existing open recommendations are kept (and re-verified by the caller when displayed). */
export async function generateRecommendations(rt: Runtime): Promise<RecommendationWithReport[]> {
  const { store } = rt;
  const state = store.getState();
  const out: RecommendationWithReport[] = [];

  for (const listing of state.listings) {
    const signals = await buildSignals(store, rt.visibility, listing.id);
    const findings = evaluateFindings(signals);
    const primary = findings[0];
    if (primary.signal === 'healthy') continue;

    // one open (proposed) recommendation per listing+signal — don't spam the feed
    const dup = state.recommendations.find(
      (r) => r.listingId === listing.id && (r.status ?? 'proposed') === 'proposed' && r.finding.signal === primary.signal,
    );
    if (dup) continue;

    let move = recommendMove(primary, signals, { channel: 'booking' });
    // Degrade to NO_ACTION when CRITICAL inputs are missing (the #1 hallucination guardrail).
    // Missing comp-set data is tolerated: real clients start without a market feed, and the
    // own-data signals (pace/occupancy/pickup) are the legally-preferred triggers anyway.
    const criticalMissing = signals.missing.filter((m) => m !== 'compMedianRate');
    if (criticalMissing.length > 0 && move.type !== 'none') continue;
    if (move.type === 'none') continue;

    // Sheets-connected clients have no execution API — the three-tier model says GUIDED:
    // RevPilot proposes with exact parameters; the operator executes in the extranet.
    const owner = state.clients.find((c) => c.id === listing.clientId);
    if (owner?.channelManager === 'sheets' && move.tier === 'api') {
      move = { ...move, tier: 'guided' };
    }

    // Bandit refines type+depth within the rules' candidate set (online learning, doc 12 §3)
    let banditChoice;
    const spec = candidateSpecFor(primary, signals);
    if (spec && spec.anchorDepth > 0) {
      const candidates = candidatesFor(spec.types, spec.anchorDepth);
      if (candidates.length > 0) {
        banditChoice = await rt.bandit.choose(
          buildContext(signals), candidates, `${state.simDate}:${listing.id}`,
        );
        move = applyBanditArm(move, banditChoice);
      }
    }

    const rec = assembleRecommendation({
      recommendationId: store.nextId('rec'),
      signals,
      finding: primary,
      move: { ...move, window: signals.window },
      banditChoice,
      listing,
      settings: state.settings,
      asOf: state.simDate,
    });

    const report = verifyRecommendation({
      rec, signals, listing, settings: state.settings, activePromos: state.promotions,
    });
    store.addRecommendation(rec);
    store.appendAudit({
      ts: state.simDate, actor: 'workflow', kind: report.pass ? 'recommendation_created' : 'verifier_block',
      listingId: listing.id, recommendationId: rec.recommendationId,
      detail: report.pass
        ? `${primary.signal}: ${rec.move.type} ${(rec.move.depthPct * 100).toFixed(0)}% -> ${(rec.targetChannels ?? []).join(', ')}`
        : `Verifier flagged: ${report.checks.filter((c) => !c.pass).map((c) => `${c.name} (${c.detail})`).join('; ')}`,
      payload: { finding: primary, banditChoice },
    });
    out.push({ rec, report, signals });

    // Optional advanced autonomy: auto-execute low-risk promos inside operator-set bounds
    if (report.pass && state.settings.autonomyMode === 'auto_within_bounds') {
      await maybeAutoExecute({ store, adapter: rt.adapter, signals }, rec);
    }
  }
  return out;
}

/** The verified view of the feed: every open recommendation re-verified against live state. */
export async function openRecommendations(rt: Runtime): Promise<RecommendationWithReport[]> {
  const state = rt.store.getState();
  const open = state.recommendations.filter((r) => (r.status ?? 'proposed') === 'proposed');
  const out: RecommendationWithReport[] = [];
  for (const rec of open) {
    const listing = state.listings.find((l) => l.id === rec.listingId);
    if (!listing) continue;
    const signals = await buildSignals(rt.store, rt.visibility, rec.listingId, rec.window);
    out.push({
      rec,
      signals,
      report: verifyRecommendation({ rec, signals, listing, settings: state.settings, activePromos: state.promotions }),
    });
  }
  return out;
}

/** Approve once -> push everywhere (or dry-run preview). Re-verifies with CURRENT signals. */
export async function approveAndPush(
  rt: Runtime,
  recommendationId: string,
  opts: { dryRun: boolean; approvalToken?: string },
): Promise<PushSummary> {
  const state = rt.store.getState();
  const rec = state.recommendations.find((r) => r.recommendationId === recommendationId);
  if (!rec) throw new Error(`unknown recommendation ${recommendationId}`);
  if ((rec.status ?? 'proposed') !== 'proposed') throw new Error(`recommendation is ${rec.status}, not open`);

  const signals = await buildSignals(rt.store, rt.visibility, rec.listingId, rec.window);
  if (!opts.dryRun) {
    rt.store.setRecommendationStatus(recommendationId, 'approved');
    rt.store.appendAudit({
      ts: state.simDate, actor: 'operator', kind: 'approved',
      listingId: rec.listingId, recommendationId,
      detail: `Operator approved ${rec.move.type} ${(rec.move.depthPct * 100).toFixed(0)}% -> pushing to ${(rec.targetChannels ?? [rec.move.channel]).join(', ')}`,
    });
  }
  return pushToAllChannels(
    { store: rt.store, adapter: rt.adapter, signals },
    rec,
    { dryRun: opts.dryRun, actor: 'operator', approvalToken: opts.approvalToken ?? 'operator-ui' },
  );
}

export async function rejectRecommendation(rt: Runtime, recommendationId: string): Promise<void> {
  const state = rt.store.getState();
  const rec = state.recommendations.find((r) => r.recommendationId === recommendationId);
  if (!rec) throw new Error(`unknown recommendation ${recommendationId}`);
  rt.store.setRecommendationStatus(recommendationId, 'rejected');
  rt.store.appendAudit({
    ts: state.simDate, actor: 'operator', kind: 'rejected',
    listingId: rec.listingId, recommendationId,
    detail: `Operator rejected ${rec.move.type} ${(rec.move.depthPct * 100).toFixed(0)}% (${rec.finding.signal})`,
  });
}

export { buildSignals, buildAllSignals, defaultWindow };
