// The explainable rules engine: Signals -> Finding -> PromoMove.
// v1 is intentionally a small, transparent rule set. Every output carries its "why".
import type { Channel, Finding, PromoMove, Signals } from '../types.ts';
import { round } from './signals.ts';
import { meetsVrboMerchandising } from '../guardrail/promotionGuardrail.ts';

/** Pace-deficit -> discount-depth ladder (docs 08 C1). Deficit is positive when behind STLY. */
export function depthForDeficit(paceVsStlyPct: number): number {
  const deficit = -paceVsStlyPct;
  if (deficit >= 0.2) return 0.2;
  if (deficit >= 0.1) return 0.15;
  if (deficit >= 0.05) return 0.1;
  return 0;
}

/** Reduce signals to a single primary finding (priority-ordered). */
export function evaluateFinding(s: Signals): Finding {
  const base = { listingId: s.listingId, window: s.window };
  const metrics = {
    occupancy: s.occupancy,
    target: s.targetOccupancy,
    paceVsStlyPct: s.paceVsStlyPct,
    compGapPct: s.compGapPct,
    pickup7d: s.pickup7d,
  };
  const behind = s.paceVsStlyPct <= -0.05;
  const ahead = s.paceVsStlyPct >= 0.1 && s.occupancyDeviation >= 0;
  const overpriced = s.compGapPct >= 0.1;

  if (ahead) {
    return { ...base, signal: 'ahead_of_pace', metrics, confidence: 0.7,
      rationale: `Pacing ${(s.paceVsStlyPct * 100).toFixed(0)}pp ahead of STLY with occupancy at/above target — protect rate.` };
  }
  if (behind && overpriced) {
    return { ...base, signal: 'soft_demand_overpriced', metrics, confidence: 0.75,
      rationale: `Occupancy ${(s.occupancy * 100).toFixed(0)}% vs target ${(s.targetOccupancy * 100).toFixed(0)}%, pacing ${(s.paceVsStlyPct * 100).toFixed(0)}pp behind STLY, and priced ${(s.compGapPct * 100).toFixed(0)}% above market.` };
  }
  if (behind) {
    return { ...base, signal: 'soft_demand', metrics, confidence: 0.65,
      rationale: `Pacing ${(s.paceVsStlyPct * 100).toFixed(0)}pp behind STLY with pickup ${s.pickup7d} over 7 days.` };
  }
  return { ...base, signal: 'healthy', metrics, confidence: 0.6,
    rationale: `On or ahead of pace; no action indicated.` };
}

export interface MoveOptions {
  channel?: Channel;   // default 'booking'
}

/** Map a finding to the best marketing move. Enforces the Vrbo 5% merchandising floor. */
export function recommendMove(finding: Finding, s: Signals, opts: MoveOptions = {}): PromoMove {
  const channel: Channel = opts.channel ?? 'booking';

  if (finding.signal === 'ahead_of_pace') {
    return { type: 'remove_discounts', channel, depthPct: 0, tier: 'api',
      rationale: 'Strong pace — remove active discounts and hold/raise the floor.' };
  }
  if (finding.signal === 'healthy') {
    return { type: 'none', channel, depthPct: 0, tier: 'recommend', rationale: finding.rationale };
  }

  // soft_demand / soft_demand_overpriced -> last-minute deal at ladder depth
  let depth = depthForDeficit(s.paceVsStlyPct);
  if (depth === 0) {
    return { type: 'none', channel, depthPct: 0, tier: 'recommend',
      rationale: 'Deficit below the 5% action threshold.' };
  }

  // Vrbo needs >=5% to earn the merchandising badge; bump if just under.
  if (channel === 'vrbo' && !meetsVrboMerchandising(depth)) depth = 0.05;

  return {
    type: 'last_minute',
    channel,
    depthPct: round(depth),
    tier: 'api', // executable via Guesty PromotionController on this channel
    rationale: `${finding.rationale} -> run a ${(depth * 100).toFixed(0)}% last-minute deal on ${channel}.`,
  };
}
