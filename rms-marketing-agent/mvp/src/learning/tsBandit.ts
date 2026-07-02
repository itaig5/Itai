// In-process Thompson-sampling fallback bandit over Beta posteriors (docs 07 1d, 12 §3).
// Runs whenever the ml-service is unreachable; the dashboard reads THIS state either way.
// Fully deterministic: samples derive from the caller's seed, never a wall clock.
import type { BanditArm, BanditChoice, BanditContext } from '../types.ts';
import type { RevPilotState } from '../store/store.ts';
import { betaSample, clamp01, hashSeed, mulberry32 } from '../util/prng.ts';
import { round } from '../rms/signals.ts';
import { armId, contextBucket } from './arms.ts';

export const TS_MODEL = 'ts-thompson-v1';

export type BanditState = RevPilotState['banditState'];

export interface BanditStateRow {
  bucket: string;
  armId: string;
  alpha: number;
  beta: number;
  pulls: number;
  mean: number;
}

function posterior(state: BanditState, key: string): { alpha: number; beta: number; pulls: number } {
  return state[key] ?? { alpha: 1, beta: 1, pulls: 0 }; // lazy uniform prior
}

export function chooseArm(
  state: BanditState,
  ctx: BanditContext,
  candidates: BanditArm[],
  seed: string | number,
): BanditChoice {
  if (candidates.length === 0) throw new Error('chooseArm: empty candidate set');
  const bucket = contextBucket(ctx);
  let best: { arm: BanditArm; sample: number; mean: number } | null = null;
  let maxMean = -Infinity;
  for (const arm of candidates) {
    const id = armId(arm);
    const p = posterior(state, `${bucket}|${id}`);
    const sample = betaSample(mulberry32(hashSeed(seed, bucket, id)), p.alpha, p.beta);
    const mean = p.alpha / (p.alpha + p.beta);
    if (mean > maxMean) maxMean = mean;
    if (best === null || sample > best.sample) best = { arm, sample, mean };
  }
  const chosen = best as NonNullable<typeof best>;
  return {
    arm: chosen.arm,
    score: round(chosen.sample, 4),
    explore: chosen.mean < maxMean, // sampled past the current best posterior mean
    model: TS_MODEL,
  };
}

export function updateArm(state: BanditState, ctx: BanditContext, arm: BanditArm, reward: number): void {
  const key = `${contextBucket(ctx)}|${armId(arm)}`;
  const p = posterior(state, key);
  const r = clamp01(reward);
  p.alpha += r;
  p.beta += 1 - r;
  p.pulls += 1;
  state[key] = p;
}

/** Dashboard rows ("bandit visibly updating"), sorted by bucket then armId. */
export function banditStateView(state: BanditState): BanditStateRow[] {
  return Object.entries(state)
    .map(([key, p]) => {
      const cut = key.lastIndexOf('|'); // bucket itself contains '|'; armId never does
      return {
        bucket: key.slice(0, cut),
        armId: key.slice(cut + 1),
        alpha: p.alpha,
        beta: p.beta,
        pulls: p.pulls,
        mean: round(p.alpha / (p.alpha + p.beta), 4),
      };
    })
    .sort((a, b) => a.bucket.localeCompare(b.bucket) || a.armId.localeCompare(b.armId));
}
