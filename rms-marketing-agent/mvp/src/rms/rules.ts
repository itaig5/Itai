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
  return evaluateFindings(s)[0];
}

/** All applicable findings, primary first. Visibility/orphan/new-listing are v2 additions
 *  that only fire when their inputs are present, so the tested v1 behavior is unchanged. */
export function evaluateFindings(s: Signals): Finding[] {
  const base = { listingId: s.listingId, window: s.window };
  const droppedPlatforms = (s.visibility ?? []).filter((v) => v.dropDetected);
  const worstDrop = droppedPlatforms[0];
  const metrics = {
    occupancy: s.occupancy,
    target: s.targetOccupancy,
    paceVsStlyPct: s.paceVsStlyPct,
    compGapPct: s.compGapPct,
    pickup7d: s.pickup7d,
    ...(s.orphanGapCount ? { orphanGaps: s.orphanGapCount } : {}),
    // visibility numbers quoted in rationales must live here — the verifier's grounding
    // check rejects any rationale number that doesn't trace back to a metric
    ...(droppedPlatforms.length ? { visibilityDrops: droppedPlatforms.length } : {}),
    ...(worstDrop?.rank != null ? { visRank: worstDrop.rank } : {}),
    ...(worstDrop?.rankTrend14d != null ? { visRankTrend: worstDrop.rankTrend14d } : {}),
    ...(worstDrop?.impressionsTrendPct != null ? { visImpressionsTrendPct: worstDrop.impressionsTrendPct } : {}),
  };
  const behind = s.paceVsStlyPct <= -0.05;
  const ahead = s.paceVsStlyPct >= 0.1 && s.occupancyDeviation >= 0;
  const overpriced = s.compGapPct >= 0.1;
  const found: Finding[] = [];

  if (ahead) {
    found.push({ ...base, signal: 'ahead_of_pace', metrics, confidence: 0.7,
      rationale: `Pacing ${(s.paceVsStlyPct * 100).toFixed(0)}pp ahead of STLY with occupancy at/above target — protect rate.` });
  }
  if (behind && overpriced) {
    found.push({ ...base, signal: 'soft_demand_overpriced', metrics, confidence: 0.75,
      rationale: `Occupancy ${(s.occupancy * 100).toFixed(0)}% vs target ${(s.targetOccupancy * 100).toFixed(0)}%, pacing ${(s.paceVsStlyPct * 100).toFixed(0)}pp behind STLY, and priced ${(s.compGapPct * 100).toFixed(0)}% above market.` });
  } else if (behind) {
    found.push({ ...base, signal: 'soft_demand', metrics, confidence: 0.65,
      rationale: `Pacing ${(s.paceVsStlyPct * 100).toFixed(0)}pp behind STLY with pickup ${s.pickup7d} over 7 days.` });
  }
  if (droppedPlatforms.length > 0) {
    const worst = droppedPlatforms[0];
    found.push({ ...base, signal: 'visibility_drop', metrics, confidence: 0.7,
      rationale: `Visibility dropped on ${droppedPlatforms.map((v) => v.platform).join(', ')}: ${worst.dropReason ?? 'rank/impressions decline'} — a native promotion earns the badge + rank boost to regain position.` });
  }
  if ((s.orphanGapCount ?? 0) > 0 && !ahead) {
    found.push({ ...base, signal: 'orphan_gap', metrics, confidence: 0.68,
      rationale: `${s.orphanGapCount} short orphan gap(s) between bookings in the window — perishable nights that need a targeted deal or min-stay tweak.` });
  }
  if (found.length === 0) {
    found.push({ ...base, signal: 'healthy', metrics, confidence: 0.6,
      rationale: `On or ahead of pace; no action indicated.` });
  }
  return found;
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
  if (finding.signal === 'visibility_drop') {
    // The regain-rank lever is a NATIVE promotion (badge + search-rank boost) — doc 12 §2.
    let vDepth = Math.max(depthForDeficit(s.paceVsStlyPct), 0.1);
    if (channel === 'vrbo' && !meetsVrboMerchandising(vDepth)) vDepth = 0.05;
    return { type: 'last_minute', channel, depthPct: round(vDepth), tier: 'api',
      rationale: `${finding.rationale} -> run a ${(vDepth * 100).toFixed(0)}% last-minute deal to regain rank.` };
  }
  if (finding.signal === 'orphan_gap') {
    // PriceLabs' orphan default is 20% (docs 07) — anchor there; the bandit may soften it.
    return { type: 'basic_deal', channel, depthPct: 0.2, tier: 'api',
      rationale: `${finding.rationale} -> targeted 20% deal on the gap nights (pair with a min-stay drop).` };
  }
  if (finding.signal === 'new_listing') {
    return { type: 'new_listing', channel, depthPct: 0.2, tier: 'api',
      rationale: `${finding.rationale} -> 20% new-listing promotion to build the first reviews.` };
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
