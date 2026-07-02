// Guesty adapter skeleton. Guesty is the ONLY channel manager whose public API exposes OTA
// promotion management (docs 06/09): PromotionController — GET list, PUT assign/unassign listings.
// Endpoints below are documented; wire the fetch calls when you have credentials.
import type { Channel, PromoMove } from '../types.ts';
import type { ChannelAdapter, JobResult, Listing } from './channelAdapter.ts';
import type { GuestyTokenManager } from './tokenCache.ts';

const BASE = 'https://open-api.guesty.com/v1';

export class GuestyAdapter implements ChannelAdapter {
  id = 'guesty';
  capabilities: ChannelAdapter['capabilities'] = {
    pushRates: true,
    pushAvailability: true,
    listOtaPromotions: true,
    executeOtaPromotions: 'api',
    promotionTargets: ['airbnb', 'booking', 'expedia', 'vrbo'] as Channel[],
  };

  private tokens: GuestyTokenManager;
  constructor(tokens: GuestyTokenManager) {
    this.tokens = tokens;
  }

  private async authHeaders(): Promise<Record<string, string>> {
    const token = await this.tokens.getToken();
    return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  }

  async getListings(): Promise<Listing[]> {
    // GET ${BASE}/listings
    throw new Error(`not wired: GET ${BASE}/listings — use fetch() + this.authHeaders()`);
  }

  async getActivePromotions(_listingId: string): Promise<PromoMove[]> {
    // GET ${BASE}/rm-promotions/promotions  (promotioncontroller_getlist)
    throw new Error(`not wired: GET ${BASE}/rm-promotions/promotions`);
  }

  async assignPromotion(_listingId: string, _move: PromoMove, _idempotencyKey: string): Promise<JobResult> {
    // PUT ${BASE}/rm-promotions/promotions/{promotionId}  (assign listing)
    // OPEN (docs 09): confirm create-vs-assign semantics + scopes against the live spec before shipping.
    throw new Error(`not wired: PUT ${BASE}/rm-promotions/promotions/{id} (assign)`);
  }

  async unassignPromotion(_listingId: string, _promotionId: string): Promise<JobResult> {
    // PUT ${BASE}/rm-promotions/promotions/{promotionId}  (unassign listing) — auto-off when pace recovers
    throw new Error(`not wired: PUT ${BASE}/rm-promotions/promotions/{id} (unassign)`);
  }
}
