// COMPLIANCE (doc 11): this source crawls PUBLIC search results as a guest ONLY — the cross-OTA
// position proxy Lighthouse/OTA Insight use. NEVER auto-scrape a logged-in extranet: all three
// OTAs' ToS prohibit bots, and doing it with the operator's own account risks suspending the
// revenue listing itself. Any live RankFetcher implementation must observe robots.txt + ToS.
import type { Platform, VisibilityObservation, VisibilitySource } from '../types.ts';
import type { Store } from '../store/store.ts';
import type { VisibilityAdapter } from './provider.ts';
import { readStoreObservations } from './provider.ts';

/** Live-crawler port: prod supplies an implementation (per-market public search, guest session). */
export interface RankFetcher {
  fetchRank(listingId: string, platform: Platform, asOf: string): Promise<number | null>;
}

export class LivePublicRankAdapter implements VisibilityAdapter {
  id = 'public_rank_live';
  source: VisibilitySource = 'public_rank';

  private fetcher: RankFetcher;

  constructor(fetcher: RankFetcher) {
    this.fetcher = fetcher;
  }

  async fetchObservations(listingId: string, platform: Platform, asOf: string): Promise<VisibilityObservation[]> {
    try {
      const rank = await this.fetcher.fetchRank(listingId, platform, asOf);
      if (rank === null || !Number.isFinite(rank)) return []; // not found in public results -> no observation
      return [{ listingId, platform, observedAt: asOf, source: this.source, rank }];
    } catch {
      return []; // a failed crawl never breaks the composite
    }
  }
}

export class StoreBackedPublicRankAdapter implements VisibilityAdapter {
  id = 'public_rank_store';
  source: VisibilitySource = 'public_rank';

  private store: Store;

  constructor(store: Store) {
    this.store = store;
  }

  async fetchObservations(listingId: string, platform: Platform, asOf: string): Promise<VisibilityObservation[]> {
    return readStoreObservations(this.store, this.source, listingId, platform, asOf);
  }
}
