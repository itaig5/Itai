// Signals -> decision-time context + the flat feature row logged with every decision
// (docs 12 §3: the feature store is half the data foundation; the outcome log is the other).
// Context uses OWN-listing data + public comps only (RealPage/AB325 legal line).
import type { BanditContext, Signals } from '../types.ts';

export function buildContext(signals: Signals): BanditContext {
  return {
    occupancyDeviation: signals.occupancyDeviation,
    paceVsStlyPct: signals.paceVsStlyPct,
    compGapPct: signals.compGapPct,
    leadTimeDays: signals.leadTimeDays,
    pickup7d: signals.pickup7d,
    visibilityDrop: (signals.visibility ?? []).some((v) => v.dropDetected) ? 1 : 0,
  };
}

/** Flat numeric row for the feature store. bestRank = min rank across platforms, -1 if untracked. */
export function featureRow(signals: Signals): Record<string, number> {
  const ranks = (signals.visibility ?? [])
    .map((v) => v.rank)
    .filter((r): r is number => r != null);
  return {
    occupancy: signals.occupancy,
    targetOccupancy: signals.targetOccupancy,
    occupancyDeviation: signals.occupancyDeviation,
    paceVsStlyPct: signals.paceVsStlyPct,
    pickup7d: signals.pickup7d,
    adr: signals.adr,
    revpan: signals.revpan,
    compGapPct: signals.compGapPct,
    leadTimeDays: signals.leadTimeDays,
    orphanGapCount: signals.orphanGapCount ?? 0,
    visibilityDrop: (signals.visibility ?? []).some((v) => v.dropDetected) ? 1 : 0,
    bestRank: ranks.length > 0 ? Math.min(...ranks) : -1,
  };
}
