// Bandit arm catalog + context bucketing (docs 12 §3, 07 1d: 3-5 depth arms per promo type,
// pooled across coarse context buckets so sparse bookings still produce learnable cells).
// MUST stay byte-identical in semantics to the Python ml-service's catalog/bucketing.
import type { BanditArm, BanditContext, MoveType } from '../types.ts';

export const ARM_CATALOG: BanditArm[] = [
  { type: 'last_minute', depthPct: 0.1 },
  { type: 'last_minute', depthPct: 0.15 },
  { type: 'last_minute', depthPct: 0.2 },
  { type: 'early_booker', depthPct: 0.1 },
  { type: 'early_booker', depthPct: 0.15 },
  { type: 'basic_deal', depthPct: 0.1 },
  { type: 'basic_deal', depthPct: 0.15 },
  { type: 'basic_deal', depthPct: 0.2 },
  { type: 'weekly_los', depthPct: 0.1 },
  { type: 'weekly_los', depthPct: 0.15 },
];

export function armId(arm: BanditArm): string {
  return `${arm.type}@${arm.depthPct.toFixed(2)}`;
}

/** Coarse context key `${d}|${v}|${c}` — shared verbatim with the ml-service. */
export function contextBucket(ctx: BanditContext): string {
  const deficit = -ctx.paceVsStlyPct;
  const d = deficit < 0.05 ? 'd0' : deficit < 0.15 ? 'd1' : 'd2';
  const v = ctx.visibilityDrop ? 'v1' : 'v0';
  const c = ctx.compGapPct >= 0.08 ? 'c1' : 'c0';
  return `${d}|${v}|${c}`;
}

/** Arms of the given types within one ladder step (±5%) of the rules-engine anchor depth —
 *  the deterministic ladder anchors the bandit's choice set. Empty -> all arms of those types. */
export function candidatesFor(types: MoveType[], anchorDepth: number): BanditArm[] {
  const ofTypes = ARM_CATALOG.filter((a) => types.includes(a.type));
  const near = ofTypes.filter((a) => Math.abs(a.depthPct - anchorDepth) <= 0.051);
  return near.length > 0 ? near : ofTypes;
}
