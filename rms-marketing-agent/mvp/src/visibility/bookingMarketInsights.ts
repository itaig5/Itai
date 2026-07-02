// Booking.com Market Insights API (doc 11) — gated to connectivity partners; the property must
// grant "Performance data and insights". It returns demand/pace/benchmarking reports
// (sales_statistics/pace/area_demand/book_window), NOT the impressions/rank/CTR funnel — that
// stays extranet-only — so observations from this source never carry searchImpressions.
import type { Platform, VisibilityObservation, VisibilitySource } from '../types.ts';
import type { RevPilotEnv } from '../config/env.ts';
import type { Store } from '../store/store.ts';
import type { VisibilityAdapter } from './provider.ts';
import { readStoreObservations } from './provider.ts';
import { round } from '../rms/signals.ts';

const REPORTS_URL = 'https://hub-api.booking.com/v1/market-insights/reports';
const TIMEOUT_MS = 10_000;

/** Request body kept in ONE place — adjust here against the live OAS (doc 11 open question). */
export function buildInsightsRequest(listingId: string, asOf: string): Record<string, unknown> {
  return {
    property_ids: [listingId],
    as_of: asOf,
    report_types: [
      'sales_statistics_report_data',
      'pace_report_data',
      'area_demand_data',
      'book_window_data',
    ],
  };
}

function rec(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/** Defensive response mapping (exported for tests; the live payload shape is 🟡 unconfirmed). */
export function mapInsightsResponse(listingId: string, asOf: string, body: unknown): VisibilityObservation[] {
  const b = rec(body);
  const sales = rec(b.sales_statistics_report_data);
  const conversion = num(sales.conversion) ?? num(sales.conversion_rate);
  const obs: VisibilityObservation = {
    listingId,
    platform: 'booking',
    observedAt: asOf,
    source: 'market_insights',
    searchImpressions: undefined, // funnel not available via this API (doc 11)
  };
  if (conversion !== undefined) obs.conversion = round(conversion);
  return [obs];
}

export class BookingMarketInsightsAdapter implements VisibilityAdapter {
  id = 'booking_market_insights';
  source: VisibilitySource = 'market_insights';

  private env: RevPilotEnv;
  private fetchImpl: typeof fetch;

  constructor(env: RevPilotEnv, fetchImpl: typeof fetch = fetch) {
    this.env = env;
    this.fetchImpl = fetchImpl;
  }

  async fetchObservations(listingId: string, platform: Platform, asOf: string): Promise<VisibilityObservation[]> {
    if (platform !== 'booking') return []; // Booking-only API
    if (!this.env.bookingInsightsEnabled || !this.env.bookingInsightsToken) return [];
    try {
      const res = await this.fetchImpl(REPORTS_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.env.bookingInsightsToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(buildInsightsRequest(listingId, asOf)),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) return [];
      return mapInsightsResponse(listingId, asOf, await res.json());
    } catch {
      return []; // adapter must never throw through the composite
    }
  }
}

export class StoreBackedMarketInsightsAdapter implements VisibilityAdapter {
  id = 'market_insights_store';
  source: VisibilitySource = 'market_insights';

  private store: Store;

  constructor(store: Store) {
    this.store = store;
  }

  async fetchObservations(listingId: string, platform: Platform, asOf: string): Promise<VisibilityObservation[]> {
    return readStoreObservations(this.store, this.source, listingId, platform, asOf);
  }
}
