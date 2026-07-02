// Guesty adapter — fully coded, credential-ready, gated behind GUESTY_ENABLED (BUILD_PROMPT).
// Guesty is the ONLY channel manager whose public API exposes OTA promotion management (docs 06/09):
// PromotionController — GET list, PUT assign/unassign listings. All network calls go through an
// injectable fetchImpl so the suite runs with zero network.
import type { Channel, MoveType, PromoMove } from '../types.ts';
import type { ChannelAdapter, GuidedStep, JobResult, Listing } from './channelAdapter.ts';
import { GuestyTokenManager, InMemoryTokenStore } from './tokenCache.ts';
import type { TokenStore } from './tokenCache.ts';
import type { RevPilotEnv } from '../config/env.ts';
import { round } from '../rms/signals.ts';
import { clamp01 } from '../util/prng.ts';

const GUESTY_BASE = 'https://open-api.guesty.com/v1';
const REQUEST_TIMEOUT_MS = 15_000;
const PAGE_LIMIT = 100;

export interface GuestyAdapterOpts {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

interface ApiResponse {
  ok: boolean;
  status: number;
  data: unknown;
  text: string;
}

/** Guesty promotion payload normalized into our vocabulary. */
interface GuestyPromo {
  id: string;
  name: string;
  moveType: MoveType;
  depthPct: number;      // 0..1
  channel: Channel;
  window?: { start: string; end: string };
  listingIds: string[];
}

type Dict = Record<string, unknown>;
const asDict = (v: unknown): Dict => (v && typeof v === 'object' ? (v as Dict) : {});
const str = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/** lastMinute/last_minute -> last_minute; earlyBird/earlyBooker/early_booker -> early_booker;
 *  weekly/los -> weekly_los; anything else -> basic_deal. */
export function mapGuestyPromoType(raw: string | undefined): MoveType {
  const k = (raw ?? '').toLowerCase().replace(/[^a-z]/g, '');
  if (k.includes('lastminute')) return 'last_minute';
  if (k.includes('earlybird') || k.includes('earlybooker')) return 'early_booker';
  if (k.includes('weekly') || k === 'los' || k.includes('lengthofstay')) return 'weekly_los';
  return 'basic_deal';
}

/** Guesty payloads carry percents as 15 or fractions as 0.15 — normalize to 0..1. */
export function toDepthFraction(v: number | undefined): number {
  if (v === undefined) return 0;
  return clamp01(v > 1 ? v / 100 : v);
}

const GUESTY_TYPE_FOR_MOVE: Partial<Record<MoveType, string>> = {
  last_minute: 'lastMinute',
  early_booker: 'earlyBird',
  weekly_los: 'weekly',
  basic_deal: 'basicDeal',
};

const OTA_CHANNELS: Channel[] = ['airbnb', 'booking', 'expedia', 'vrbo'];

function toChannel(v: string | undefined): Channel | undefined {
  const k = v?.toLowerCase() ?? '';
  if (k.startsWith('booking')) return 'booking';
  return OTA_CHANNELS.find((c) => c === k);
}

function promoListingIds(p: Dict): string[] {
  const ids: string[] = [];
  for (const field of ['listingIds', 'assignedListings']) {
    const arr = p[field];
    if (!Array.isArray(arr)) continue;
    for (const entry of arr) {
      if (typeof entry === 'string') ids.push(entry);
      else {
        const e = asDict(entry);
        const id = str(e._id) ?? str(e.listingId) ?? str(e.id);
        if (id) ids.push(id);
      }
    }
  }
  return ids;
}

/** Defensive normalization of the PromotionController list payload (array | {results} | {data}). */
function normalizePromos(payload: unknown): GuestyPromo[] {
  const body = asDict(payload);
  const items = Array.isArray(payload) ? payload
    : Array.isArray(body.results) ? body.results
    : Array.isArray(body.data) ? body.data : [];
  const out: GuestyPromo[] = [];
  for (const item of items) {
    const p = asDict(item);
    const id = str(p._id) ?? str(p.id);
    if (!id) continue;
    const status = str(p.status)?.toLowerCase();
    if (p.active === false || status === 'ended' || status === 'inactive' || status === 'archived') continue;
    const start = str(p.startDate);
    const end = str(p.endDate);
    out.push({
      id,
      name: str(p.name) ?? str(p.title) ?? id,
      moveType: mapGuestyPromoType(str(p.type) ?? str(p.promotionType)),
      depthPct: toDepthFraction(num(p.discountPercent) ?? num(p.discount) ?? num(p.amount)),
      // rm-promotions apply account-wide across connected OTAs; default to booking when unspecified
      channel: toChannel(str(p.channel) ?? str(p.platform)) ?? 'booking',
      window: start && end ? { start: start.slice(0, 10), end: end.slice(0, 10) } : undefined,
      listingIds: promoListingIds(p),
    });
  }
  return out;
}

function toPromoMove(p: GuestyPromo): PromoMove {
  return {
    type: p.moveType,
    channel: p.channel,
    depthPct: round(p.depthPct, 4),
    tier: 'api',
    rationale: `Guesty promotion "${p.name}" active at ${round(p.depthPct * 100, 1)}% off`,
    ...(p.window ? { window: p.window } : {}),
  };
}

/** Guided-tier deep links + operator checklists — surfaces with NO promo API (doc 11); the operator
 *  clicks, RevPilot supplies the exact steps. Shared with MockChannelAdapter. */
export function buildOtaGuidedStep(move: PromoMove): GuidedStep {
  const pct = `${round(move.depthPct * 100, 1)}%`;
  const dates = move.window ? `${move.window.start} to ${move.window.end}` : 'the recommended stay dates';
  switch (move.channel) {
    case 'booking':
      return {
        url: 'https://admin.booking.com/hotel/hoteladmin/extranet_ng/manage/promotions.html',
        steps: [
          'Log in to admin.booking.com and open Promotions -> Visibility Booster.',
          `Set the boost so the effective guest discount is ~${pct} for ${dates}.`,
          'Review the projected ranking lift, then activate the booster.',
          'Confirm the property shows the strikethrough badge / deal tag in public Booking.com search.',
        ],
      };
    case 'airbnb':
      return {
        url: 'https://www.airbnb.com/hosting/promotions',
        steps: [
          'Open airbnb.com/hosting/promotions for this listing.',
          `Create a custom promotion at ${pct} off for ${dates}.`,
          'Check the stacked total with any rule-set/non-refundable discounts stays under the guardrail cap.',
          'Publish the promotion.',
          'Confirm the listing shows the strikethrough badge in Airbnb search.',
        ],
      };
    case 'expedia':
      return {
        url: 'https://partnercentral.expediagroup.com',
        steps: [
          'Log in to Expedia Partner Central and open Marketing -> Promotions / Accelerator.',
          `Create the promotion at ${pct} off (or an equivalent Accelerator bid) for ${dates}.`,
          'Activate and note the projected visibility change.',
          'Confirm the rate shows the strikethrough badge in Expedia search.',
        ],
      };
    case 'vrbo':
      return {
        url: 'https://www.vrbo.com/p/dashboard',
        steps: [
          'Log in to the Vrbo partner dashboard and open Rates -> Promotions.',
          `Create a discount of ${pct} — Vrbo needs >=5% to earn merchandising (docs 09) — for ${dates}.`,
          'Apply it to this property and save.',
          'Confirm the listing shows the strikethrough badge in Vrbo search.',
        ],
      };
    default:
      return {
        url: '',
        steps: [`Apply a ${pct} ${move.type} discount for ${dates} on the direct booking site.`],
      };
  }
}

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
  private baseUrl: string;
  private fetchImpl: typeof fetch;
  // docs 08: duplicate execute with the same key returns the cached result — no second write.
  private idempotency = new Map<string, JobResult>();

  constructor(tokens: GuestyTokenManager, opts: GuestyAdapterOpts = {}) {
    this.tokens = tokens;
    this.baseUrl = (opts.baseUrl ?? GUESTY_BASE).replace(/\/$/, '');
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private async api(
    method: string,
    path: string,
    opts: { body?: unknown; headers?: Record<string, string> } = {},
  ): Promise<ApiResponse> {
    const token = await this.tokens.getToken();
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...opts.headers,
      },
      ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
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
      return {
        ok: false,
        message: 'Guesty rate limit hit (HTTP 429): open-api throttles requests and caps token grants at 5/24h (docs 09) — back off and retry later',
      };
    }
    return { ok: false, message: `Guesty API error ${res.status}${res.text ? `: ${res.text}` : ''}` };
  }

  async getListings(): Promise<Listing[]> {
    const out: Listing[] = [];
    for (let skip = 0; ; skip += PAGE_LIMIT) {
      const res = await this.api('GET', `/listings?limit=${PAGE_LIMIT}&skip=${skip}`);
      if (!res.ok) throw new Error(this.httpFailure(res).message);
      const page = asDict(res.data);
      const results = Array.isArray(page.results) ? page.results : [];
      for (const raw of results) {
        const l = asDict(raw);
        const id = str(l._id) ?? str(l.id) ?? '';
        if (!id) continue;
        out.push({
          id,
          name: str(l.title) ?? str(l.nickname) ?? id,
          // Conservative default: per-listing channel detection needs the Guesty integrations
          // endpoint (not wired yet) — assume all four OTA targets until it is.
          channels: [...OTA_CHANNELS],
        });
      }
      const count = num(page.count) ?? out.length;
      if (results.length === 0 || results.length < PAGE_LIMIT || out.length >= count) break;
    }
    return out;
  }

  async getActivePromotions(listingId: string): Promise<PromoMove[]> {
    const res = await this.api('GET', '/rm-promotions/promotions');
    if (!res.ok) throw new Error(this.httpFailure(res).message);
    return normalizePromos(res.data)
      .filter((p) => p.listingIds.includes(listingId))
      .map(toPromoMove);
  }

  async assignPromotion(listingId: string, move: PromoMove, idempotencyKey: string): Promise<JobResult> {
    const prior = this.idempotency.get(idempotencyKey);
    if (prior) return prior;
    let result: JobResult;
    try {
      result = await this.doAssign(listingId, move, idempotencyKey);
    } catch (err) {
      result = { ok: false, message: `Guesty request failed: ${(err as Error).message}` };
    }
    if (result.ok) this.idempotency.set(idempotencyKey, result); // failures stay retryable
    return result;
  }

  private async doAssign(listingId: string, move: PromoMove, idempotencyKey: string): Promise<JobResult> {
    const list = await this.api('GET', '/rm-promotions/promotions');
    if (!list.ok) return this.httpFailure(list);
    const match = normalizePromos(list.data).find(
      (p) => p.moveType === move.type && Math.abs(p.depthPct - move.depthPct) < 0.005,
    );
    let promotionId: string;
    let note: string;
    if (match) {
      promotionId = match.id;
      note = `reused existing Guesty promotion "${match.name}"`;
    } else {
      const created = await this.createPromotion(move, idempotencyKey);
      if ('fail' in created) return created.fail;
      promotionId = created.id;
      note = 'created new Guesty promotion';
    }
    const res = await this.api('PUT', `/rm-promotions/promotions/${promotionId}`, {
      body: { action: 'assign', listingIds: [listingId] },
      headers: { 'Idempotency-Key': idempotencyKey },
    });
    if (!res.ok) return this.httpFailure(res);
    return {
      ok: true,
      ref: promotionId,
      message: `assigned to ${listingId} — ${note} (${round(move.depthPct * 100, 1)}% ${move.type})`,
    };
  }

  // OPEN (docs 09): PromotionController documents GET list + PUT assign/unassign; whether promotions
  // can be CREATED via POST (vs pre-created in the Guesty dashboard) must be confirmed against the
  // live OAS before go-live. The create path is isolated here so it can be disabled independently.
  private async createPromotion(
    move: PromoMove,
    idempotencyKey: string,
  ): Promise<{ id: string } | { fail: JobResult }> {
    const pct = round(move.depthPct * 100, 1);
    const res = await this.api('POST', '/rm-promotions/promotions', {
      body: {
        name: `RevPilot ${move.type} ${pct}%`,
        type: GUESTY_TYPE_FOR_MOVE[move.type] ?? 'basicDeal',
        discountPercent: pct,
        ...(move.window ? { startDate: move.window.start, endDate: move.window.end } : {}),
      },
      headers: { 'Idempotency-Key': idempotencyKey },
    });
    if (!res.ok) return { fail: this.httpFailure(res) };
    const body = asDict(res.data);
    const id = str(body._id) ?? str(body.id) ?? str(asDict(body.data)._id);
    if (!id) return { fail: { ok: false, message: 'Guesty create promotion returned no id' } };
    return { id };
  }

  /** Auto-turn-OFF path: unassign the listing once pace recovers. */
  async unassignPromotion(listingId: string, promotionId: string): Promise<JobResult> {
    try {
      const res = await this.api('PUT', `/rm-promotions/promotions/${promotionId}`, {
        body: { action: 'unassign', listingIds: [listingId] },
      });
      if (!res.ok) return this.httpFailure(res);
      return { ok: true, ref: promotionId, message: `unassigned Guesty promotion ${promotionId} from ${listingId}` };
    } catch (err) {
      return { ok: false, message: `Guesty request failed: ${(err as Error).message}` };
    }
  }

  buildGuidedStep(move: PromoMove): GuidedStep {
    return buildOtaGuidedStep(move);
  }
}

/** Wires the credential-ready adapter. Throws unless GUESTY_ENABLED + client credentials are set —
 *  seed-data mode uses MockChannelAdapter instead. */
export function createGuestyAdapter(
  env: RevPilotEnv,
  tokenStore: TokenStore = new InMemoryTokenStore(),
  opts: { fetchImpl?: typeof fetch } = {},
): GuestyAdapter {
  const clientId = env.guestyClientId;
  const clientSecret = env.guestyClientSecret;
  if (!env.guestyEnabled || !clientId || !clientSecret) {
    throw new Error(
      'Guesty adapter disabled: set GUESTY_ENABLED=true, GUESTY_CLIENT_ID and GUESTY_CLIENT_SECRET (seed-data mode uses the mock adapter)',
    );
  }
  const fetchImpl = opts.fetchImpl ?? fetch;
  const tokenUrl = `${env.guestyBaseUrl.replace(/\/v\d+\/?$/, '')}/oauth2/token`;
  // Guesty grants at most 5 tokens per 24h (docs 09) — the cached manager is mandatory
  // (InMemoryTokenStore for dev; swap a Redis-backed TokenStore in prod).
  const tokens = new GuestyTokenManager(
    tokenStore,
    async () => {
      const res = await fetchImpl(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          scope: 'open-api',
          client_id: clientId,
          client_secret: clientSecret,
        }).toString(),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`Guesty token request failed (${res.status}) — mind the 5 tokens/24h cap`);
      const json = (await res.json()) as { access_token: string; expires_in: number };
      return { token: json.access_token, ttlMs: json.expires_in * 1000 };
    },
    { key: 'guesty' },
  );
  return new GuestyAdapter(tokens, { baseUrl: env.guestyBaseUrl, fetchImpl });
}
