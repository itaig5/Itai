// RevPilot MCP server — the agent-facing door to the system (docs 04/07: "use MCP as the
// orchestration layer; optionally expose your own MCP server so operators can talk to their
// revenue agent"). It wraps the SAME core the dashboard uses, preserving the 3-tool safety
// contract: reads are free, proposals are pure, and the ONLY write tool demands an explicit
// approval token + defaults to dry-run. Every call lands in the immutable audit trail.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Runtime } from '../engine/engine.ts';
import {
  approveAndPush, buildSignals, generateRecommendations, openRecommendations, rejectRecommendation,
} from '../engine/engine.ts';
import { advanceDay } from '../sample/simulator.ts';
import { addClient, connectClient, toClientView } from '../clients/clientService.ts';
import { banditStateView } from '../learning/tsBandit.ts';

const json = (value: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
});
const fail = (message: string) => ({
  content: [{ type: 'text' as const, text: message }],
  isError: true,
});

export function buildMcpServer(rt: Runtime): McpServer {
  const server = new McpServer({ name: 'revpilot', version: '0.2.0' });

  // ---- READS (safe to call speculatively) ----------------------------------

  server.registerTool('get_portfolio', {
    title: 'Portfolio overview',
    description:
      'Read-only. Every listing with its computed revenue signals for the next 21 nights: occupancy vs target, '
      + 'pace vs same-time-last-year, RevPAN, comp gap, active promotions, and visibility-drop flags. '
      + 'Call this first to see where attention is needed.',
    annotations: { readOnlyHint: true },
  }, async () => {
    const state = rt.store.getState();
    const rows = [];
    for (const l of state.listings) {
      const s = await buildSignals(rt.store, rt.visibility, l.id);
      rows.push({
        listingId: l.id, name: l.name, market: l.market, client: l.clientId,
        occupancy: s.occupancy, targetOccupancy: s.targetOccupancy,
        paceVsStlyPct: s.paceVsStlyPct, revpan: s.revpan, adr: s.adr, compGapPct: s.compGapPct,
        activePromotions: state.promotions.filter((p) => p.listingId === l.id && p.status === 'active').length,
        visibilityDrop: (s.visibility ?? []).some((v) => v.dropDetected),
        missingInputs: s.missing,
      });
    }
    return json({ simDate: state.simDate, listings: rows });
  });

  server.registerTool('get_signals', {
    title: 'Listing signals (tool 1 of 3: read)',
    description:
      'Read-only. The full deterministic signal set for one listing — occupancy, pace, pickup, ADR/RevPAN, '
      + 'comp gap, orphan gaps, per-platform visibility (rank, impressions, drops). ALL math happens here; '
      + 'never recompute or estimate these numbers yourself.',
    inputSchema: { listingId: z.string().describe('e.g. L-MARINA — ids come from get_portfolio') },
    annotations: { readOnlyHint: true },
  }, async ({ listingId }) => {
    try {
      return json(await buildSignals(rt.store, rt.visibility, listingId));
    } catch (err) {
      return fail(err instanceof Error ? err.message : 'unknown listing');
    }
  });

  server.registerTool('get_recommendations', {
    title: 'Open recommendations (tool 2 of 3: propose)',
    description:
      'Runs the recommendation sweep (rules pick the lever, the contextual bandit picks type+depth), then returns '
      + 'every OPEN recommendation with its plain-English why, target channels, per-channel stacked-discount guard '
      + 'preview, and the verifier report. Proposals have NO side effects on any channel — execution requires '
      + 'approve_and_push with an approval token.',
    annotations: { readOnlyHint: true },
  }, async () => {
    await generateRecommendations(rt);
    const open = await openRecommendations(rt);
    return json(open.map(({ rec, report }) => ({
      recommendationId: rec.recommendationId,
      listingId: rec.listingId,
      signal: rec.finding.signal,
      why: rec.move.rationale,
      action: { type: rec.move.type, depthPct: rec.move.depthPct, window: rec.window },
      targetChannels: rec.targetChannels,
      banditChoice: rec.banditChoice,
      verifierPass: report.pass,
      verifierChecks: report.checks,
      guardPreview: report.guards,
      guidedActions: rec.guidedActions,
    })));
  });

  server.registerTool('get_promotion_radar', {
    title: 'Promotion radar',
    description: 'Read-only. Every promotion across all listings and channels: live ones (with source — revpilot / '
      + 'operator-created in the extranet / OTA program) and recently ended ones with the reason (incl. automatic '
      + 'turn-offs on pace recovery).',
    annotations: { readOnlyHint: true },
  }, async () => {
    const state = rt.store.getState();
    return json({
      simDate: state.simDate,
      active: state.promotions.filter((p) => p.status === 'active'),
      recentlyEnded: state.promotions.filter((p) => p.status === 'ended').slice(-15),
    });
  });

  server.registerTool('get_audit_log', {
    title: 'Audit trail',
    description: 'Read-only. The immutable, append-only record of every recommendation, approval, push, guardrail '
      + 'block, outcome measurement, and learning update — newest first.',
    inputSchema: { limit: z.number().int().min(1).max(500).optional().describe('default 50') },
    annotations: { readOnlyHint: true },
  }, async ({ limit }) => {
    const state = rt.store.getState();
    return json(state.audit.slice(-(limit ?? 50)).reverse());
  });

  server.registerTool('get_learning_state', {
    title: 'Learning engine state',
    description: 'Read-only. The outcome log (baseline → measured result → reward per executed action) and the '
      + 'contextual bandit\'s posteriors per context-bucket × promo-arm — how the policy is learning from its own results.',
    annotations: { readOnlyHint: true },
  }, async () => {
    const state = rt.store.getState();
    const measured = state.outcomes.filter((o) => o.status === 'measured');
    return json({
      outcomes: state.outcomes,
      measuredCount: measured.length,
      avgReward: measured.length ? measured.reduce((a, o) => a + (o.reward ?? 0), 0) / measured.length : null,
      banditModel: state.banditModel,
      banditArms: banditStateView(state.banditState).filter((r) => r.pulls > 0),
    });
  });

  server.registerTool('list_clients', {
    title: 'Client accounts',
    description: 'Read-only. The property-manager accounts RevPilot manages, their connection status, and per-client '
      + 'counts (listings, open recommendations, live promotions). Credentials are always masked.',
    annotations: { readOnlyHint: true },
  }, async () => {
    const state = rt.store.getState();
    return json(state.clients.map((c) => toClientView(rt.store, c)));
  });

  // ---- GATED WRITES (the only tools with side effects) ---------------------

  server.registerTool('approve_and_push', {
    title: 'Approve & push everywhere (tool 3 of 3: gated write)',
    description:
      'THE write tool: executes an approved recommendation across ALL its target channels simultaneously, with the '
      + 'double-discount/clip-floor guard re-checked per channel immediately before each write. Requires an explicit '
      + 'approvalToken identifying the human who approved — NEVER invent one; ask the operator. dryRun defaults to '
      + 'TRUE (preview only): pass dryRun=false only after the operator has seen the preview and confirmed. '
      + 'Do NOT use this tool to estimate outcomes — use get_recommendations for previews.',
    inputSchema: {
      recommendationId: z.string(),
      approvalToken: z.string().min(1).describe('who approved, e.g. "itai@dconsult.me" — the audit trail records it'),
      dryRun: z.boolean().optional().describe('default TRUE. false = live push to every target channel'),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
  }, async ({ recommendationId, approvalToken, dryRun }) => {
    if (!approvalToken.trim()) return fail('approve_and_push refused: empty approval token');
    try {
      const summary = await approveAndPush(rt, recommendationId, {
        dryRun: dryRun ?? true, // preview unless the human explicitly went live (docs 08)
        approvalToken,
      });
      return json(summary);
    } catch (err) {
      return fail(err instanceof Error ? err.message : 'push failed');
    }
  });

  server.registerTool('reject_recommendation', {
    title: 'Reject a recommendation',
    description: 'Marks an open recommendation rejected (audited). Use when the operator declines a proposal.',
    inputSchema: { recommendationId: z.string() },
    annotations: { readOnlyHint: false, idempotentHint: true },
  }, async ({ recommendationId }) => {
    try {
      await rejectRecommendation(rt, recommendationId);
      return json({ ok: true, recommendationId, status: 'rejected' });
    } catch (err) {
      return fail(err instanceof Error ? err.message : 'reject failed');
    }
  });

  server.registerTool('add_client', {
    title: 'Add a client (demo portfolio)',
    description:
      'Onboards a property-manager account with a generated demo portfolio (full booking history) and connects it — '
      + 'the listings immediately feed the brain. Via MCP only demo mode is allowed; connecting real Guesty/Hostaway '
      + 'credentials must happen in the dashboard so secrets never pass through a model context.',
    inputSchema: {
      name: z.string(),
      contactEmail: z.string(),
      market: z.string(),
      demoListingCount: z.number().int().min(1).max(12).optional().describe('default 4'),
    },
    annotations: { readOnlyHint: false },
  }, async ({ name, contactEmail, market, demoListingCount }) => {
    try {
      const client = addClient(rt.store, { name, contactEmail, market, channelManager: 'demo', demoListingCount });
      const result = await connectClient(rt.store, client.id, { env: rt.env, demoListingCount });
      return json({ client: toClientView(rt.store, rt.store.getState().clients.find((c) => c.id === client.id)!), connect: result });
    } catch (err) {
      return fail(err instanceof Error ? err.message : 'add client failed');
    }
  });

  server.registerTool('advance_demo_day', {
    title: 'Advance the demo world one day',
    description:
      'DEMO worlds only: runs the daily pipeline in fast-forward (simulated bookings, OTB snapshot, due-outcome '
      + 'measurement, bandit update, auto-turn-off of recovered promos). In production this runs on the scheduler, '
      + 'not on demand.',
    annotations: { readOnlyHint: false },
  }, async () => json(await advanceDay(rt)));

  return server;
}
