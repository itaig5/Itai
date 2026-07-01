// The three-tool contract (docs 08). Read / propose / gated-write.
// The LLM orchestrates these; it NEVER computes the numbers itself.
import type { Channel, Recommendation, Signals } from '../types.ts';
import type { InsightsProvider } from '../insights/insightsProvider.ts';
import type { ChannelAdapter } from '../adapters/channelAdapter.ts';
import { evaluateFinding, recommendMove } from '../rms/rules.ts';

export interface Policy {
  channel?: Channel;
  maxEffectiveDiscount?: number;
}

// TOOL 1 — read-only. Does ALL the math up front.
export async function getSignals(
  provider: InsightsProvider,
  listingId: string,
  window: { start: string; end: string },
): Promise<Signals> {
  return provider.getSignals(listingId, window);
}

// TOOL 2 — pure. No side effects. Grounds itself in the signals; degrades to NO_ACTION on missing data.
export function recommendPromotion(signals: Signals, policy: Policy = {}): Recommendation {
  const finding = evaluateFinding(signals);
  let move = recommendMove(finding, signals, { channel: policy.channel });

  if (signals.missing.length > 0) {
    move = {
      ...move,
      type: 'none',
      tier: 'recommend',
      rationale: `Missing/stale inputs (${signals.missing.join(', ')}) -> NO_ACTION`,
    };
  }

  return {
    recommendationId: makeId(signals),
    listingId: signals.listingId,
    window: signals.window,
    move,
    finding,
    confidence: finding.confidence,
    requiresHumanApproval: true, // advisory-only: execution always needs a human
    risk: move.type === 'last_minute'
      ? 'Discount depth affects margin — verify against the clip floor before executing.'
      : 'Low.',
    createdAt: signals.dataFreshnessTs,
  };
}

export interface ExecuteInput {
  approvalToken: string;   // single-use human approval token
  idempotencyKey: string;  // dedupe retries
  dryRun?: boolean;        // defaults to true — preview unless explicitly false
}

export type ExecuteResult =
  | { status: 'no_action' }
  | { status: 'dry_run'; wouldExecute: Recommendation['move'] }
  | { status: 'guided'; move: Recommendation['move']; note: string }
  | { status: 'executed'; result: unknown };

// TOOL 3 — gated write. Refuses without a human token; dry-run by default; idempotent.
export async function executePromotion(
  adapter: ChannelAdapter,
  rec: Recommendation,
  input: ExecuteInput,
): Promise<ExecuteResult> {
  if (!input.approvalToken) {
    throw new Error('executePromotion refused: missing human approval token');
  }
  if (rec.move.type === 'none') return { status: 'no_action' };

  if (input.dryRun !== false) {
    return { status: 'dry_run', wouldExecute: rec.move };
  }
  if (rec.move.tier !== 'api' || !adapter.assignPromotion) {
    return { status: 'guided', move: rec.move, note: 'Not API-executable on this channel — guided step required.' };
  }
  const result = await adapter.assignPromotion(rec.listingId, rec.move, input.idempotencyKey);
  return { status: 'executed', result };
}

// Deterministic id (no Date.now/random) so runs are reproducible and auditable.
function makeId(s: Signals): string {
  return `rec_${s.listingId}_${s.window.start}_${s.dataFreshnessTs}`.replace(/[^a-zA-Z0-9_]/g, '');
}
