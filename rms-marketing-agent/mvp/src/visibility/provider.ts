// VisibilityProvider port (doc 11): no single OTA API exposes the search funnel, so visibility
// is assembled per platform from independent adapters (market_insights / public_rank /
// operator_input / reviews) and merged by summarizeVisibility.
import type { Platform, VisibilityObservation, VisibilitySignals, VisibilitySource } from '../types.ts';
import type { Store } from '../store/store.ts';
import { summarizeVisibility } from './math.ts';

export interface VisibilityAdapter {
  id: string;
  source: VisibilitySource;
  fetchObservations(listingId: string, platform: Platform, asOf: string): Promise<VisibilityObservation[]>;
}

export interface VisibilityProviderPort {
  id: string;
  getVisibility(listingId: string, platforms: Platform[], asOf: string): Promise<VisibilitySignals[]>;
}

/** Store read shared by the StoreBacked* adapters (seed-data mode + operator-ingested rows). */
export function readStoreObservations(
  store: Store,
  source: VisibilitySource,
  listingId: string,
  platform: Platform,
  asOf: string,
): VisibilityObservation[] {
  return store.getState().visibilityObservations.filter(
    (o) =>
      o.source === source &&
      o.listingId === listingId &&
      o.platform === platform &&
      Date.parse(o.observedAt) <= Date.parse(asOf),
  );
}

export class CompositeVisibilityProvider implements VisibilityProviderPort {
  id = 'visibility_composite';
  /** Adapter ids that failed on the most recent getVisibility() call. */
  failedAdapterIds: string[] = [];

  private adapters: VisibilityAdapter[];

  constructor(adapters: VisibilityAdapter[]) {
    this.adapters = adapters;
  }

  async getVisibility(listingId: string, platforms: Platform[], asOf: string): Promise<VisibilitySignals[]> {
    const failed: string[] = [];
    const out: VisibilitySignals[] = [];
    for (const platform of platforms) {
      const settled = await Promise.allSettled(
        // async wrapper so a synchronous throw is also captured as a rejection
        this.adapters.map(async (a) => a.fetchObservations(listingId, platform, asOf)),
      );
      const observations: VisibilityObservation[] = [];
      settled.forEach((r, i) => {
        if (r.status === 'fulfilled') observations.push(...r.value);
        else failed.push(this.adapters[i].id); // a broken source just leaves its metrics in missing[]
      });
      out.push(summarizeVisibility(listingId, platform, observations, asOf));
    }
    this.failedAdapterIds = [...new Set(failed)];
    return out;
  }
}
