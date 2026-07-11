// The cross-channel execution orchestrator — the product's centerpiece:
// the operator approves ONCE, RevPilot pushes the promotion to EVERY connected channel,
// with the double-discount/clip-floor guard re-checked per channel BEFORE each write.
import type {
  Channel, OutcomeRecord, PromotionRecord, Recommendation, Signals,
} from '../types.ts';
import type { ChannelAdapter } from '../adapters/channelAdapter.ts';
import type { Store } from '../store/store.ts';
import type { GuardResult } from '../guardrail/promotionGuardrail.ts';
import { executePromotion, type ExecuteResult } from '../agent/tools.ts';
import { guardForChannel, withinBounds, verifyRecommendation } from '../verifier/verifier.ts';
import { buildContext } from '../learning/featureStore.ts';
import { round } from '../rms/signals.ts';

export interface ChannelPushResult {
  channel: Channel;
  guard: GuardResult;
  execution: ExecuteResult | { status: 'blocked'; reason: string };
  promotionRef?: string;
}

export interface PushSummary {
  recommendationId: string;
  dryRun: boolean;
  results: ChannelPushResult[];
  executedChannels: Channel[];
  blockedChannels: Channel[];
  outcomeId: string | null; // the pending outcome-log row (live pushes only)
}

export interface OrchestratorDeps {
  store: Store;
  adapter: ChannelAdapter;
  /** current signals for the listing — baseline for outcome measurement */
  signals: Signals;
}

export interface PushOptions {
  dryRun: boolean;
  actor: 'operator' | 'system';
  approvalToken: string; // operator id, or `auto-bounds` when executed within operator-set bounds
}

export async function pushToAllChannels(
  deps: OrchestratorDeps,
  rec: Recommendation,
  opts: PushOptions,
): Promise<PushSummary> {
  const { store, adapter, signals } = deps;
  const state = store.getState();
  const listing = state.listings.find((l) => l.id === rec.listingId);
  if (!listing) throw new Error(`unknown listing ${rec.listingId}`);
  const now = state.simDate;
  const channels = (rec.targetChannels?.length ? rec.targetChannels : [rec.move.channel]);

  const results: ChannelPushResult[] = [];
  for (const channel of channels) {
    // Guard BEFORE every write, per channel, against promos active RIGHT NOW (they may have
    // changed since the recommendation was verified).
    const guard = guardForChannel(channel, listing, signals, rec.move.depthPct, state.promotions, state.settings);
    if (!guard.approved && rec.move.type !== 'remove_discounts') {
      store.appendAudit({
        ts: now, actor: 'system', kind: 'guardrail_block', listingId: rec.listingId,
        recommendationId: rec.recommendationId, channel,
        detail: `Blocked on ${channel}: ${guard.reason}`,
        payload: guard,
      });
      results.push({ channel, guard, execution: { status: 'blocked', reason: guard.reason ?? 'guardrail' } });
      continue;
    }

    if (rec.move.type === 'remove_discounts') {
      const removed = await removeActiveDiscounts(store, adapter, rec.listingId, channel, now, opts.dryRun);
      results.push({ channel, guard, execution: removed });
      continue;
    }

    const perChannelRec: Recommendation = {
      ...rec,
      move: { ...rec.move, channel, window: rec.move.window ?? rec.window },
    };
    const execution = await executePromotion(adapter, perChannelRec, {
      approvalToken: opts.approvalToken,
      idempotencyKey: `${rec.recommendationId}:${channel}`,
      dryRun: opts.dryRun,
    });
    const ref = execution.status === 'executed' && typeof execution.result === 'object' && execution.result !== null
      ? (execution.result as { ref?: string }).ref
      : undefined;
    if (!opts.dryRun && ref) {
      // tie the channel-side promotion back to the approval that caused it (audit chain)
      store.update((s) => {
        const p = s.promotions.find((x) => x.id === ref);
        if (p && !p.recommendationId) p.recommendationId = rec.recommendationId;
      });
    }
    store.appendAudit({
      ts: now,
      actor: opts.actor,
      kind: opts.dryRun ? 'dry_run' : execution.status === 'executed' ? (opts.actor === 'system' ? 'auto_executed' : 'executed') : 'guided_step',
      listingId: rec.listingId,
      recommendationId: rec.recommendationId,
      channel,
      detail: opts.dryRun
        ? `Dry run on ${channel}: would set ${rec.move.type} at ${(rec.move.depthPct * 100).toFixed(0)}% (public price ${guard.finalPrice})`
        : execution.status === 'executed'
          ? `Pushed ${rec.move.type} at ${(rec.move.depthPct * 100).toFixed(0)}% to ${channel} (ref ${ref ?? 'n/a'})`
          : `Guided step required on ${channel} (no promotions API)`,
      payload: { guard, execution },
    });
    results.push({ channel, guard, execution, promotionRef: ref });
  }

  const executedChannels = results
    .filter((r) => r.execution.status === 'executed' || r.execution.status === 'dry_run')
    .map((r) => r.channel);
  const blockedChannels = results.filter((r) => r.execution.status === 'blocked').map((r) => r.channel);

  let outcomeId: string | null = null;
  if (!opts.dryRun) {
    const anyExecuted = results.some((r) => r.execution.status === 'executed');
    const anyGuided = results.some((r) => r.execution.status === 'guided');
    // guided-tier approvals issued their checklists — that IS the action for no-API clients
    store.setRecommendationStatus(
      rec.recommendationId,
      anyExecuted ? (opts.actor === 'system' ? 'auto_executed' : 'executed') : anyGuided ? 'executed' : 'blocked',
    );
    if (anyExecuted && rec.move.type !== 'remove_discounts') {
      outcomeId = openOutcome(store, rec, signals, results, now);
    }
  }

  return { recommendationId: rec.recommendationId, dryRun: opts.dryRun, results, executedChannels, blockedChannels, outcomeId };
}

/** ahead_of_pace path: unassign RevPilot-managed discounts on the channel. */
async function removeActiveDiscounts(
  store: Store,
  adapter: ChannelAdapter,
  listingId: string,
  channel: Channel,
  now: string,
  dryRun: boolean,
): Promise<ExecuteResult> {
  const active = store.getState().promotions.filter(
    (p) => p.listingId === listingId && p.channel === channel && p.status === 'active' && p.source === 'revpilot',
  );
  if (dryRun) return { status: 'dry_run', wouldExecute: { type: 'remove_discounts', channel, depthPct: 0, tier: 'api', rationale: `unassign ${active.length} promo(s)` } };
  for (const promo of active) {
    if (adapter.unassignPromotion) await adapter.unassignPromotion(listingId, promo.id);
    store.endPromotion(promo.id, now, 'operator');
    store.appendAudit({
      ts: now, actor: 'system', kind: 'promo_ended', listingId, channel,
      detail: `Removed ${promo.type} ${(promo.depthPct * 100).toFixed(0)}% on ${channel} (strong pace — protect rate)`,
    });
  }
  return { status: 'executed', result: { ok: true, ref: `removed:${active.length}` } };
}

/** Open the pending outcome-log row: the labeled-data moat starts at execution time. */
function openOutcome(
  store: Store,
  rec: Recommendation,
  signals: Signals,
  results: ChannelPushResult[],
  now: string,
): string {
  const state = store.getState();
  const bestRank = (signals.visibility ?? [])
    .map((v) => v.rank)
    .filter((r): r is number => r != null)
    .reduce<number | null>((min, r) => (min == null || r < min ? r : min), null);
  const outcome: OutcomeRecord = {
    id: store.nextId('out'),
    recommendationId: rec.recommendationId,
    listingId: rec.listingId,
    channels: results.filter((r) => r.execution.status === 'executed').map((r) => r.channel),
    actionType: rec.move.type,
    depthPct: rec.move.depthPct,
    context: buildContext(signals),
    executedAt: now,
    measureAfterDays: state.settings.measureAfterDays,
    measuredAt: null,
    baseline: {
      occupancy: signals.occupancy,
      pickupPerDay: round(signals.pickup7d / 7, 3),
      revpan: signals.revpan,
      rank: bestRank,
    },
    result: null,
    bookingLift: null,
    revenueLift: null,
    visibilityChange: null,
    reward: null,
    status: 'pending',
  };
  store.addOutcome(outcome);
  return outcome.id;
}

/** Auto-turn-OFF (doc 12 §1): unassign RevPilot promos once pace recovers to target. */
export async function autoTurnOffRecovered(
  store: Store,
  adapter: ChannelAdapter,
  signalsByListing: Map<string, Signals>,
): Promise<PromotionRecord[]> {
  const state = store.getState();
  if (!state.settings.autoTurnOffEnabled) return [];
  const now = state.simDate;
  const ended: PromotionRecord[] = [];
  for (const promo of state.promotions) {
    if (promo.status !== 'active' || promo.source !== 'revpilot') continue;
    const s = signalsByListing.get(promo.listingId);
    if (!s) continue;
    const recovered = s.paceVsStlyPct >= -0.02 && s.occupancyDeviation >= -0.02;
    if (!recovered) continue;
    if (adapter.unassignPromotion) await adapter.unassignPromotion(promo.listingId, promo.id);
    // the adapter may have already flipped the record (mock ends with 'operator') —
    // force the true reason so the radar's "auto-off: pace recovered" story is accurate
    store.update((s) => {
      const p = s.promotions.find((x) => x.id === promo.id);
      if (p) {
        p.status = 'ended';
        p.endedAt = p.endedAt ?? now;
        p.endedReason = 'pace_recovered';
      }
    });
    store.appendAudit({
      ts: now, actor: 'system', kind: 'promo_ended', listingId: promo.listingId, channel: promo.channel,
      detail: `Auto-ended ${promo.type} ${(promo.depthPct * 100).toFixed(0)}% on ${promo.channel} — pace recovered to target.`,
    });
    ended.push(promo);
  }
  return ended;
}

/** The optional advanced path: execute WITHOUT a per-action click, but ONLY inside
 *  operator-set bounds (no hidden auto-accept — RealPage/AB325 line). */
export async function maybeAutoExecute(
  deps: OrchestratorDeps,
  rec: Recommendation,
): Promise<PushSummary | { skipped: string }> {
  const { store, signals } = deps;
  const state = store.getState();
  const listing = state.listings.find((l) => l.id === rec.listingId);
  if (!listing) return { skipped: 'unknown listing' };
  const activeCount = state.promotions.filter((p) => p.listingId === rec.listingId && p.status === 'active').length;
  const bounds = withinBounds(rec, state.settings, activeCount);
  if (!bounds.ok) return { skipped: bounds.reason };
  const report = verifyRecommendation({ rec, signals, listing, settings: state.settings, activePromos: state.promotions });
  if (!report.pass) return { skipped: `verifier: ${report.checks.filter((c) => !c.pass).map((c) => c.name).join(', ')}` };
  return pushToAllChannels(deps, rec, { dryRun: false, actor: 'system', approvalToken: 'auto-bounds' });
}
