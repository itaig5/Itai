// Outcome -> normalized reward in [0,1] for the bandit (docs 12 §3).
// Identical formula in the Python ml-service — change both or neither.
import { clamp01 } from '../util/prng.ts';
import { round } from '../rms/signals.ts';

export interface RewardInput {
  bookingLift: number | null;      // pickup/day delta vs baseline (null = unmeasured -> 0)
  revenueLift: number | null;      // revpan delta vs baseline (null = unmeasured -> 0)
  visibilityChange: number | null; // rank positions recovered (null = untracked -> neutral 0.5)
  baselineRevpan: number;
}

export function computeReward(input: RewardInput): number {
  const normBooking = clamp01(0.5 + (input.bookingLift ?? 0) / 0.5);
  const normRev = clamp01(0.5 + (input.revenueLift ?? 0) / Math.max(1, 0.5 * input.baselineRevpan));
  const normVis = input.visibilityChange == null ? 0.5 : clamp01(0.5 + input.visibilityChange / 20);
  return round(0.4 * normBooking + 0.4 * normRev + 0.2 * normVis, 4);
}
