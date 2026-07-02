// Seed-data channel adapter — the WHOLE demo runs on this. Same contract and capabilities as the
// Guesty adapter, but reads/writes the in-process Store instead of the network, so "approve once ->
// push everywhere" is demoable with zero credentials.
import type { PromoMove, PromotionRecord } from '../types.ts';
import type { ChannelAdapter, GuidedStep, JobResult, Listing } from './channelAdapter.ts';
import type { Store } from '../store/store.ts';
import { addDays } from '../util/dates.ts';
import { buildOtaGuidedStep } from './guestyAdapter.ts';

const DEFAULT_WINDOW_DAYS = 14;
const DEPTH_EPSILON = 0.005;

function overlaps(a: { start: string; end: string }, b: { start: string; end: string }): boolean {
  return a.start <= b.end && b.start <= a.end; // ISO dates compare lexicographically
}

export class MockChannelAdapter implements ChannelAdapter {
  id = 'mock';
  capabilities: ChannelAdapter['capabilities'] = {
    pushRates: true,
    pushAvailability: true,
    listOtaPromotions: true,
    executeOtaPromotions: 'api',
    promotionTargets: ['airbnb', 'booking', 'expedia', 'vrbo'],
  };

  private store: Store;
  // docs 08: duplicate execute with the same key returns the cached result — no second write.
  private idempotency = new Map<string, JobResult>();

  constructor(store: Store) {
    this.store = store;
  }

  async getListings(): Promise<Listing[]> {
    return this.store.getState().listings.map((l) => ({ id: l.id, name: l.name, channels: l.channels }));
  }

  async getActivePromotions(listingId: string): Promise<PromoMove[]> {
    return this.store.getState().promotions
      .filter((p) => p.listingId === listingId && p.status === 'active')
      .map((p) => ({
        type: p.type,
        channel: p.channel,
        depthPct: p.depthPct,
        tier: 'api',
        rationale: `active ${p.source} promotion ${p.id} on ${p.channel}`,
        window: p.window,
      }));
  }

  async assignPromotion(listingId: string, move: PromoMove, idempotencyKey: string): Promise<JobResult> {
    const prior = this.idempotency.get(idempotencyKey);
    if (prior) return prior;

    const simDate = this.store.getState().simDate;
    const window = move.window ?? { start: simDate, end: addDays(simDate, DEFAULT_WINDOW_DAYS) };

    // Identity dedupe: an equivalent promo already live on this channel is a no-op, not a duplicate.
    const existing = this.store.getState().promotions.find(
      (p) =>
        p.status === 'active' &&
        p.listingId === listingId &&
        p.channel === move.channel &&
        p.type === move.type &&
        Math.abs(p.depthPct - move.depthPct) < DEPTH_EPSILON &&
        overlaps(p.window, window),
    );
    if (existing) {
      const result: JobResult = {
        ok: true,
        ref: existing.id,
        message: `already active on ${move.channel} as ${existing.id} — idempotent no-op`,
      };
      this.idempotency.set(idempotencyKey, result);
      return result;
    }

    const promo: PromotionRecord = {
      id: this.store.nextId('promo'),
      listingId,
      channel: move.channel,
      type: move.type,
      depthPct: move.depthPct,
      window,
      status: 'active',
      source: 'revpilot',
      createdAt: simDate,
    };
    this.store.addPromotion(promo);
    const result: JobResult = {
      ok: true,
      ref: promo.id,
      message: `synced to ${move.channel} (simulated ~5 min OTA propagation)`,
    };
    this.idempotency.set(idempotencyKey, result);
    return result;
  }

  /** Auto-turn-OFF path. The pace-recovery flow re-labels the reason via the orchestrator. */
  async unassignPromotion(_listingId: string, promotionId: string): Promise<JobResult> {
    const simDate = this.store.getState().simDate;
    this.store.endPromotion(promotionId, simDate, 'operator');
    return { ok: true, ref: promotionId, message: `promotion ${promotionId} ended` };
  }

  buildGuidedStep(move: PromoMove): GuidedStep {
    return buildOtaGuidedStep(move);
  }
}
