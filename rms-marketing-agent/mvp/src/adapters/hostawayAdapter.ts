// Hostaway adapter — RATES/CALENDAR ONLY. Hostaway has NO coupon/promotion POST API (docs 09):
// promotions there are guided — pre-configured dashboard discount slots or base-rate updates.
// Token handling reuses GuestyTokenManager: despite the name it is CM-agnostic (TokenStore +
// fetchToken + expiry skew); renaming it belongs to the tokenCache owner.
import type { PromoMove } from '../types.ts';
import type { ChannelAdapter, GuidedStep, JobResult, Listing } from './channelAdapter.ts';
import { GuestyTokenManager, InMemoryTokenStore } from './tokenCache.ts';
import type { TokenStore } from './tokenCache.ts';
import type { RevPilotEnv } from '../config/env.ts';
import { round } from '../rms/signals.ts';

const HOSTAWAY_BASE = 'https://api.hostaway.com/v1';
const REQUEST_TIMEOUT_MS = 15_000;
// Hostaway access tokens are long-lived (~24 months); fallback TTL when expires_in is absent.
const DEFAULT_TOKEN_TTL_S = 15_768_000;

export interface HostawayAdapterOpts {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export interface RateUpdate {
  date: string;      // ISO stay date
  price: number;
  minStay?: number;
}

interface ApiResponse {
  ok: boolean;
  status: number;
  data: unknown;
  text: string;
}

type Dict = Record<string, unknown>;
const asDict = (v: unknown): Dict => (v && typeof v === 'object' ? (v as Dict) : {});

export class HostawayAdapter implements ChannelAdapter {
  id = 'hostaway';
  capabilities: ChannelAdapter['capabilities'] = {
    pushRates: true,
    pushAvailability: true,
    listOtaPromotions: false,
    executeOtaPromotions: 'none',
    promotionTargets: [],
  };

  private tokens: GuestyTokenManager;
  private baseUrl: string;
  private fetchImpl: typeof fetch;

  constructor(tokens: GuestyTokenManager, opts: HostawayAdapterOpts = {}) {
    this.tokens = tokens;
    this.baseUrl = (opts.baseUrl ?? HOSTAWAY_BASE).replace(/\/$/, '');
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private async api(method: string, path: string, body?: unknown): Promise<ApiResponse> {
    const token = await this.tokens.getToken();
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const text = await res.text();
    let data: unknown = null;
    if (text) {
      try { data = JSON.parse(text); } catch { data = null; }
    }
    return { ok: res.ok, status: res.status, data, text: text.slice(0, 200) };
  }

  private httpFailure(res: ApiResponse): JobResult {
    if (res.status === 429) {
      return { ok: false, message: 'Hostaway rate limit hit (HTTP 429) — back off and retry later' };
    }
    return { ok: false, message: `Hostaway API error ${res.status}${res.text ? `: ${res.text}` : ''}` };
  }

  async getListings(): Promise<Listing[]> {
    const res = await this.api('GET', '/listings');
    if (!res.ok) throw new Error(this.httpFailure(res).message);
    const body = asDict(res.data);
    const items = Array.isArray(body.result) ? body.result : [];
    return items
      .map((raw) => asDict(raw))
      .filter((l) => l.id !== undefined && l.id !== null)
      .map((l) => ({
        id: String(l.id),
        name: typeof l.name === 'string' && l.name !== ''
          ? l.name
          : typeof l.internalListingName === 'string' && l.internalListingName !== ''
            ? l.internalListingName
            : String(l.id),
        // Hostaway's listings endpoint doesn't expose the channel mix; conservative default.
        channels: ['airbnb', 'booking', 'vrbo'],
      }));
  }

  /** Hostaway exposes NO promotion read/write API (docs 09) — nothing to list. */
  async getActivePromotions(_listingId: string): Promise<PromoMove[]> {
    return [];
  }

  /** The lever Hostaway DOES expose: calendar rate/min-stay writes. One interval per update —
   *  contiguous-run batching is not worth the complexity at this volume. */
  async pushRates(listingId: string, updates: RateUpdate[]): Promise<JobResult> {
    try {
      const body = updates.map((u) => ({
        startDate: u.date,
        endDate: u.date,
        price: u.price,
        ...(u.minStay !== undefined ? { minimumStay: u.minStay } : {}),
      }));
      const res = await this.api('PUT', `/listings/${listingId}/calendarIntervals`, body);
      if (!res.ok) return this.httpFailure(res);
      return {
        ok: true,
        ref: listingId,
        message: `pushed ${updates.length} calendar update(s) to Hostaway listing ${listingId}`,
      };
    } catch (err) {
      return { ok: false, message: `Hostaway request failed: ${(err as Error).message}` };
    }
  }

  /** Promotions on Hostaway are operator-guided: dashboard discount slots (docs 09). */
  buildGuidedStep(move: PromoMove): GuidedStep {
    const pct = `${round(move.depthPct * 100, 1)}%`;
    const dates = move.window ? `${move.window.start} to ${move.window.end}` : 'the recommended stay dates';
    return {
      url: 'https://dashboard.hostaway.com',
      steps: [
        "Log in to the Hostaway dashboard and open this listing's pricing settings.",
        `Configure a pre-set discount slot of ${pct} for ${dates} (Hostaway has no promotion API).`,
        'Check the channel markup keeps the net rate above the clip floor.',
        `Save and wait for channel sync, then confirm the ${move.channel} listing shows the discounted rate with the strikethrough badge.`,
      ],
    };
  }
}

/** Wires the credential-ready adapter. Throws unless HOSTAWAY_ENABLED + account credentials are set —
 *  seed-data mode uses MockChannelAdapter instead. */
export function createHostawayAdapter(
  env: RevPilotEnv,
  tokenStore: TokenStore = new InMemoryTokenStore(),
  opts: { fetchImpl?: typeof fetch } = {},
): HostawayAdapter {
  const accountId = env.hostawayAccountId;
  const apiKey = env.hostawayApiKey;
  if (!env.hostawayEnabled || !accountId || !apiKey) {
    throw new Error(
      'Hostaway adapter disabled: set HOSTAWAY_ENABLED=true, HOSTAWAY_ACCOUNT_ID and HOSTAWAY_API_KEY (seed-data mode uses the mock adapter)',
    );
  }
  const fetchImpl = opts.fetchImpl ?? fetch;
  const base = env.hostawayBaseUrl.replace(/\/$/, '');
  const tokens = new GuestyTokenManager(
    tokenStore,
    async () => {
      const res = await fetchImpl(`${base}/accessTokens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: accountId,
          client_secret: apiKey,
          scope: 'general',
        }).toString(),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`Hostaway token request failed (${res.status})`);
      const json = (await res.json()) as { access_token: string; expires_in?: number };
      return { token: json.access_token, ttlMs: (json.expires_in ?? DEFAULT_TOKEN_TTL_S) * 1000 };
    },
    { key: 'hostaway' },
  );
  return new HostawayAdapter(tokens, { baseUrl: base, fetchImpl });
}
