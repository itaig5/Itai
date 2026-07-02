// Reviews/quality via the channel manager (Guesty) API — a ToS-safe reputation signal that
// influences OTA rank (doc 11). Native scales differ: Airbnb/Vrbo rate 0..5, Booking/Expedia
// 0..10 — everything is normalized to 0..10 for VisibilityObservation.reviewScore.
import type { Platform, VisibilityObservation, VisibilitySource } from '../types.ts';
import type { RevPilotEnv } from '../config/env.ts';
import type { Store } from '../store/store.ts';
import type { VisibilityAdapter } from './provider.ts';
import { readStoreObservations } from './provider.ts';
import { round } from '../rms/signals.ts';

const TIMEOUT_MS = 10_000;
const FIVE_STAR_PLATFORMS: Platform[] = ['airbnb', 'vrbo'];

/** Native-scale average -> 0..10 (Airbnb/Vrbo 0..5 *2; Booking/Expedia already 0..10). */
export function normalizeReviewScore(avgNativeRating: number, platform: Platform): number {
  const scaled = FIVE_STAR_PLATFORMS.includes(platform) ? avgNativeRating * 2 : avgNativeRating;
  return round(Math.max(0, Math.min(10, scaled)), 2);
}

function rec(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/** Defensive: accept {results|reviews|[]} rows, keep rows for this platform (or untagged rows). */
export function averageNativeRating(body: unknown, platform: Platform): number | null {
  const b = rec(body);
  const raw = Array.isArray(body) ? body : Array.isArray(b.results) ? b.results : Array.isArray(b.reviews) ? b.reviews : [];
  const ratings: number[] = [];
  for (const item of raw) {
    const r = rec(item);
    const channel = r.channel ?? r.platform;
    if (typeof channel === 'string' && channel !== platform) continue;
    const rating = num(r.rating) ?? num(r.overallRating) ?? num(r.score);
    if (rating !== undefined) ratings.push(rating);
  }
  if (ratings.length === 0) return null;
  return ratings.reduce((s, x) => s + x, 0) / ratings.length;
}

export class GuestyReviewsAdapter implements VisibilityAdapter {
  id = 'guesty_reviews';
  source: VisibilitySource = 'reviews';

  private env: RevPilotEnv;
  private getToken: () => Promise<string>; // GuestyTokenManager.getToken — 5 tokens/24h cap
  private fetchImpl: typeof fetch;

  constructor(env: RevPilotEnv, getToken: () => Promise<string>, fetchImpl: typeof fetch = fetch) {
    this.env = env;
    this.getToken = getToken;
    this.fetchImpl = fetchImpl;
  }

  async fetchObservations(listingId: string, platform: Platform, asOf: string): Promise<VisibilityObservation[]> {
    if (!this.env.guestyEnabled) return [];
    try {
      const token = await this.getToken();
      const url = `${this.env.guestyBaseUrl}/reviews?listingId=${encodeURIComponent(listingId)}`;
      const res = await this.fetchImpl(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) return [];
      const avg = averageNativeRating(await res.json(), platform);
      if (avg === null) return [];
      return [
        {
          listingId,
          platform,
          observedAt: asOf,
          source: this.source,
          reviewScore: normalizeReviewScore(avg, platform),
        },
      ];
    } catch {
      return []; // adapter must never throw through the composite
    }
  }
}

export class StoreBackedReviewsAdapter implements VisibilityAdapter {
  id = 'reviews_store';
  source: VisibilitySource = 'reviews';

  private store: Store;

  constructor(store: Store) {
    this.store = store;
  }

  async fetchObservations(listingId: string, platform: Platform, asOf: string): Promise<VisibilityObservation[]> {
    return readStoreObservations(this.store, this.source, listingId, platform, asOf);
  }
}
