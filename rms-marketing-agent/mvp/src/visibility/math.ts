// Multi-source visibility merge (docs 11 / 12 §2). Pure + deterministic: time only enters via
// observedAt/asOf parameters. Funnel metrics are mostly extranet-only, so each metric may come
// from a different source — merge per listing+platform and record what is absent in missing[].
import type { Platform, ProgramStatus, VisibilityObservation, VisibilitySignals, VisibilitySource } from '../types.ts';
import { round } from '../rms/signals.ts';

const DAY_MS = 86_400_000;
const SOURCE_ORDER: VisibilitySource[] = ['market_insights', 'public_rank', 'operator_input', 'reviews'];

// Drop thresholds (doc 12 §2: a drop is what triggers the marketing engine).
const RANK_DROP_POSITIONS = 5;
const IMPRESSIONS_DROP_PCT = -0.25;
const CONVERSION_DROP_PCT = 0.4;

/** Nearest observation to targetTs — same nearest-snapshot style as pickupOverWindow (signals.ts). */
function nearestTo(obs: VisibilityObservation[], targetTs: number): VisibilityObservation {
  let best = obs[0];
  let dist = Infinity;
  for (const o of obs) {
    const d = Math.abs(Date.parse(o.observedAt) - targetTs);
    if (d < dist) {
      dist = d;
      best = o;
    }
  }
  return best;
}

export function summarizeVisibility(
  listingId: string,
  platform: Platform,
  observations: VisibilityObservation[],
  asOf: string,
): VisibilitySignals {
  const asOfTs = Date.parse(asOf);
  const obs = observations
    .filter((o) => o.listingId === listingId && o.platform === platform && Date.parse(o.observedAt) <= asOfTs)
    .sort((a, b) => a.observedAt.localeCompare(b.observedAt));

  // rank: latest observation carrying one; the compliant public_rank proxy wins over other sources
  const rankObs = obs.filter((o) => o.rank !== undefined);
  const preferredRankObs = rankObs.filter((o) => o.source === 'public_rank');
  const latestRank = (preferredRankObs.length > 0 ? preferredRankObs : rankObs).at(-1);
  const rank = latestRank?.rank ?? null;

  let rankTrend14d: number | null = null;
  if (rank !== null && rankObs.length >= 2) {
    const baseline = nearestTo(rankObs, asOfTs - 14 * DAY_MS);
    rankTrend14d = round(rank - (baseline.rank as number));
  }

  const impObs = obs.filter((o) => o.searchImpressions !== undefined);
  const latestImp = impObs.at(-1);
  const impressions7d = latestImp?.searchImpressions ?? null;
  let impressionsTrendPct: number | null = null;
  if (latestImp !== undefined && impObs.length >= 2) {
    const prior = nearestTo(impObs.slice(0, -1), Date.parse(latestImp.observedAt) - 7 * DAY_MS);
    const prev = prior.searchImpressions as number;
    if (prev > 0) impressionsTrendPct = round(((impressions7d as number) - prev) / prev);
  }

  const latestCtr = obs.filter((o) => o.ctr !== undefined).at(-1);
  const ctr = latestCtr !== undefined ? round(latestCtr.ctr as number) : null;

  const convObs = obs.filter((o) => o.conversion !== undefined);
  const latestConv = convObs.at(-1);
  const conversion = latestConv !== undefined ? round(latestConv.conversion as number) : null;

  const latestReview = obs.filter((o) => o.source === 'reviews' && o.reviewScore !== undefined).at(-1);
  const reviewScore = latestReview !== undefined ? round(latestReview.reviewScore as number, 2) : null;

  // programs: union by name, latest enrolled flag wins (obs are already sorted ascending)
  const programMap = new Map<string, boolean>();
  for (const o of obs) for (const p of o.programs ?? []) programMap.set(p.program, p.enrolled);
  const programs: ProgramStatus[] = [...programMap].map(([program, enrolled]) => ({ program, enrolled }));

  const present = new Set(obs.map((o) => o.source));
  const sources = SOURCE_ORDER.filter((s) => present.has(s));

  const missing: string[] = [];
  if (rank === null) missing.push('rank');
  if (impressions7d === null) missing.push('impressions');
  if (ctr === null) missing.push('ctr');
  if (conversion === null) missing.push('conversion');
  if (reviewScore === null) missing.push('reviewScore');

  // Drop detection — a missing metric never fires (no data is not a drop).
  const reasons: string[] = [];
  if (rankTrend14d !== null && rankTrend14d >= RANK_DROP_POSITIONS) {
    reasons.push(`rank fell ${rankTrend14d} positions over 14d (now #${rank})`);
  }
  if (impressionsTrendPct !== null && impressionsTrendPct <= IMPRESSIONS_DROP_PCT) {
    reasons.push(`search impressions down ${Math.round(-impressionsTrendPct * 100)}% week-over-week`);
  }
  if (convObs.length >= 2) {
    const prev = convObs[convObs.length - 2].conversion as number;
    const cur = convObs[convObs.length - 1].conversion as number;
    if (prev > 0 && (prev - cur) / prev >= CONVERSION_DROP_PCT) {
      reasons.push(`conversion fell ${Math.round(((prev - cur) / prev) * 100)}% vs previous observation`);
    }
  }

  return {
    listingId,
    platform,
    rank,
    rankTrend14d,
    impressions7d,
    impressionsTrendPct,
    ctr,
    conversion,
    reviewScore,
    programs,
    dropDetected: reasons.length > 0,
    dropReason: reasons.length > 0 ? reasons.join('; ') : null,
    dataFreshnessTs: obs.at(-1)?.observedAt ?? asOf,
    sources,
    missing,
  };
}

/** Positions recovered after an action (positive = improved) — feeds OutcomeRecord.visibilityChange. */
export function rankRecovery(before: VisibilitySignals, after: VisibilitySignals): number | null {
  if (before.rank === null || after.rank === null) return null;
  return round(before.rank - after.rank);
}
