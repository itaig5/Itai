import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GuestyAdapter, createGuestyAdapter, buildOtaGuidedStep } from '../src/adapters/guestyAdapter.ts';
import { HostawayAdapter, createHostawayAdapter } from '../src/adapters/hostawayAdapter.ts';
import { MockChannelAdapter } from '../src/adapters/mockAdapter.ts';
import { GuestyTokenManager, InMemoryTokenStore } from '../src/adapters/tokenCache.ts';
import { MemoryStore, DEFAULT_SETTINGS } from '../src/store/store.ts';
import type { RevPilotState } from '../src/store/store.ts';
import { loadEnv } from '../src/config/env.ts';
import type { PromoMove } from '../src/types.ts';

const SIM_DATE = '2026-07-02';

// ---------- fetch mock (no network anywhere in this suite) ----------

interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
}

function fetchMock(route: (call: FetchCall) => { status?: number; body?: unknown }) {
  const calls: FetchCall[] = [];
  const impl = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries((init?.headers ?? {}) as Record<string, string>)) {
      headers[k.toLowerCase()] = v;
    }
    const call: FetchCall = {
      url: String(input),
      method: init?.method ?? 'GET',
      headers,
      body: typeof init?.body === 'string' ? init.body : null,
    };
    calls.push(call);
    const r = route(call);
    return new Response(JSON.stringify(r.body ?? {}), {
      status: r.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  return { impl, calls };
}

const guestyEnv = () =>
  loadEnv({ GUESTY_ENABLED: 'true', GUESTY_CLIENT_ID: 'cid', GUESTY_CLIENT_SECRET: 'sec' });
const hostawayEnv = () =>
  loadEnv({ HOSTAWAY_ENABLED: 'true', HOSTAWAY_ACCOUNT_ID: 'acc', HOSTAWAY_API_KEY: 'key' });

const isToken = (c: FetchCall) => c.url.includes('/oauth2/token') || c.url.endsWith('/accessTokens');
const TOKEN_BODY = { access_token: 'tok1', expires_in: 86400 };

function makeState(): RevPilotState {
  return {
    seed: 1,
    simDate: SIM_DATE,
    clients: [],
    users: [],
    listings: [{
      id: 'L1', cmId: 'g1', name: 'Test Loft', market: 'austin', bedrooms: 2, baseRate: 200,
      targetOccupancy: 0.75, channels: ['airbnb', 'booking'], createdAt: '2025-01-01', imageHue: 120,
    }],
    calendar: {}, reservations: [], snapshots: {}, stlyOccupancy: {}, compMedianRate: {},
    visibilityObservations: [], promotions: [], recommendations: [], outcomes: [], audit: [],
    settings: DEFAULT_SETTINGS, banditState: {}, banditModel: 'none', counters: {},
  };
}

function move(over: Partial<PromoMove> = {}): PromoMove {
  return { type: 'last_minute', channel: 'booking', depthPct: 0.15, tier: 'api', rationale: 'pace behind', ...over };
}

// ---------- Guesty ----------

test('guesty: token fetched once across multiple API calls (tokenCache through the adapter path)', async () => {
  const { impl, calls } = fetchMock((c) => {
    if (isToken(c)) return { body: TOKEN_BODY };
    return { body: { results: [], count: 0 } };
  });
  const adapter = createGuestyAdapter(guestyEnv(), new InMemoryTokenStore(), { fetchImpl: impl });
  await adapter.getListings();
  await adapter.getActivePromotions('L1');

  const tokenCalls = calls.filter(isToken);
  assert.equal(tokenCalls.length, 1);
  assert.match(tokenCalls[0].body ?? '', /grant_type=client_credentials/);
  assert.match(tokenCalls[0].body ?? '', /scope=open-api/);
  const apiCalls = calls.filter((c) => !isToken(c));
  assert.ok(apiCalls.length >= 2);
  for (const c of apiCalls) assert.equal(c.headers.authorization, 'Bearer tok1');
});

test('guesty: getListings paginates limit/skip and maps _id/title/nickname', async () => {
  const items = (from: number, n: number) =>
    Array.from({ length: n }, (_, i) => (from + i === 1
      ? { _id: 'g1', nickname: 'Nick Only' }
      : { _id: `g${from + i}`, title: `Listing ${from + i}` }));
  const { impl, calls } = fetchMock((c) => {
    if (isToken(c)) return { body: TOKEN_BODY };
    const skip = Number(new URL(c.url).searchParams.get('skip'));
    return { body: { results: skip === 0 ? items(0, 100) : items(100, 30), count: 130 } };
  });
  const adapter = createGuestyAdapter(guestyEnv(), new InMemoryTokenStore(), { fetchImpl: impl });
  const listings = await adapter.getListings();

  assert.equal(listings.length, 130);
  assert.deepEqual(listings[0], { id: 'g0', name: 'Listing 0', channels: ['airbnb', 'booking', 'expedia', 'vrbo'] });
  assert.equal(listings[1].name, 'Nick Only'); // title ?? nickname fallback
  const pages = calls.filter((c) => c.url.includes('/listings?'));
  assert.equal(pages.length, 2);
  assert.match(pages[0].url, /limit=100&skip=0/);
  assert.match(pages[1].url, /limit=100&skip=100/);
});

test('guesty: getActivePromotions maps types, depth conventions and assignment shapes', async () => {
  const promos = {
    results: [
      { _id: 'p1', name: 'Summer LM', type: 'lastMinute', discountPercent: 15, listingIds: ['L1'],
        startDate: '2026-07-03', endDate: '2026-07-17' },
      { _id: 'p2', type: 'early_booker', discount: 0.1, assignedListings: [{ listingId: 'L1' }] },
      { _id: 'p3', type: 'weekly', amount: 20, listingIds: ['L2'] }, // other listing — filtered out
      { _id: 'p4', type: 'mysteryDeal', discountPercent: 5, listingIds: ['L1'] },
    ],
  };
  const { impl } = fetchMock((c) => (isToken(c) ? { body: TOKEN_BODY } : { body: promos }));
  const adapter = createGuestyAdapter(guestyEnv(), new InMemoryTokenStore(), { fetchImpl: impl });
  const active = await adapter.getActivePromotions('L1');

  assert.deepEqual(active.map((m) => m.type), ['last_minute', 'early_booker', 'basic_deal']);
  assert.deepEqual(active.map((m) => m.depthPct), [0.15, 0.1, 0.05]);
  assert.equal(active.every((m) => m.tier === 'api'), true);
  assert.match(active[0].rationale, /Summer LM/);
  assert.deepEqual(active[0].window, { start: '2026-07-03', end: '2026-07-17' });
});

test('guesty: assignPromotion reuses a matching existing promotion via PUT assign', async () => {
  const promos = { results: [{ _id: 'p9', name: 'LM 15', type: 'lastMinute', discountPercent: 15, listingIds: [] }] };
  const { impl, calls } = fetchMock((c) => (isToken(c) ? { body: TOKEN_BODY } : { body: promos }));
  const adapter = createGuestyAdapter(guestyEnv(), new InMemoryTokenStore(), { fetchImpl: impl });
  const res = await adapter.assignPromotion('L1', move(), 'key-1');

  assert.equal(res.ok, true);
  assert.equal(res.ref, 'p9');
  const put = calls.find((c) => c.method === 'PUT');
  assert.ok(put, 'expected a PUT assign call');
  assert.ok(put.url.endsWith('/rm-promotions/promotions/p9'));
  assert.deepEqual(JSON.parse(put.body ?? ''), { action: 'assign', listingIds: ['L1'] });
  assert.equal(put.headers['idempotency-key'], 'key-1');
  assert.equal(calls.filter((c) => c.method === 'POST' && !isToken(c)).length, 0); // no create needed
});

test('guesty: assignPromotion creates when no promo matches (docs-09 OPEN create path)', async () => {
  const { impl, calls } = fetchMock((c) => {
    if (isToken(c)) return { body: TOKEN_BODY };
    if (c.method === 'POST') return { body: { _id: 'pNew' } };
    if (c.method === 'GET') return { body: { results: [] } };
    return { body: {} };
  });
  const adapter = createGuestyAdapter(guestyEnv(), new InMemoryTokenStore(), { fetchImpl: impl });
  const res = await adapter.assignPromotion('L1', move({ window: { start: '2026-07-05', end: '2026-07-19' } }), 'key-c');

  assert.equal(res.ok, true);
  assert.equal(res.ref, 'pNew');
  const post = calls.find((c) => c.method === 'POST' && !isToken(c));
  assert.ok(post);
  const body = JSON.parse(post.body ?? '');
  assert.equal(body.type, 'lastMinute');
  assert.equal(body.discountPercent, 15);
  assert.equal(body.startDate, '2026-07-05');
  const put = calls.find((c) => c.method === 'PUT');
  assert.ok(put?.url.endsWith('/rm-promotions/promotions/pNew'));
});

test('guesty: assignPromotion is idempotent — same key twice, one write, same result object', async () => {
  const promos = { results: [{ _id: 'p9', name: 'LM 15', type: 'lastMinute', discountPercent: 15 }] };
  const { impl, calls } = fetchMock((c) => (isToken(c) ? { body: TOKEN_BODY } : { body: promos }));
  const adapter = createGuestyAdapter(guestyEnv(), new InMemoryTokenStore(), { fetchImpl: impl });
  const r1 = await adapter.assignPromotion('L1', move(), 'key-1');
  const r2 = await adapter.assignPromotion('L1', move(), 'key-1');

  assert.equal(r2, r1); // the cached JobResult object itself
  assert.equal(calls.filter((c) => c.method === 'PUT').length, 1);
  assert.equal(calls.filter((c) => c.method === 'GET').length, 1); // second call never re-lists
});

test('guesty: 429 -> ok:false with a Guesty rate-limit message', async () => {
  const promos = { results: [{ _id: 'p9', type: 'lastMinute', discountPercent: 15 }] };
  const { impl } = fetchMock((c) => {
    if (isToken(c)) return { body: TOKEN_BODY };
    if (c.method === 'PUT') return { status: 429, body: {} };
    return { body: promos };
  });
  const adapter = createGuestyAdapter(guestyEnv(), new InMemoryTokenStore(), { fetchImpl: impl });
  const res = await adapter.assignPromotion('L1', move(), 'key-429');

  assert.equal(res.ok, false);
  assert.match(res.message ?? '', /rate limit/i);
  assert.match(res.message ?? '', /Guesty/);
  assert.match(res.message ?? '', /5\/24h/); // token cap called out (docs 09)
});

test('guesty: network error -> ok:false, and unassign PUTs the correct body', async () => {
  // network failure path
  const failing = (async () => { throw new Error('ECONNRESET'); }) as unknown as typeof fetch;
  const failingAdapter = new GuestyAdapter(
    new GuestyTokenManager(new InMemoryTokenStore(), async () => ({ token: 't', ttlMs: 86400000 })),
    { fetchImpl: failing },
  );
  const failed = await failingAdapter.assignPromotion('L1', move(), 'key-net');
  assert.equal(failed.ok, false);
  assert.match(failed.message ?? '', /ECONNRESET/);

  // unassign path (auto-turn-off)
  const { impl, calls } = fetchMock((c) => (isToken(c) ? { body: TOKEN_BODY } : { body: {} }));
  const adapter = createGuestyAdapter(guestyEnv(), new InMemoryTokenStore(), { fetchImpl: impl });
  const res = await adapter.unassignPromotion('L1', 'p9');
  assert.equal(res.ok, true);
  const put = calls.find((c) => c.method === 'PUT');
  assert.ok(put?.url.endsWith('/rm-promotions/promotions/p9'));
  assert.deepEqual(JSON.parse(put?.body ?? ''), { action: 'unassign', listingIds: ['L1'] });
});

test('createGuestyAdapter throws without env flag/credentials', () => {
  assert.throws(() => createGuestyAdapter(loadEnv({})), /GUESTY_ENABLED/);
  assert.throws(
    () => createGuestyAdapter(loadEnv({ GUESTY_ENABLED: 'true', GUESTY_CLIENT_ID: 'cid' })),
    /GUESTY_CLIENT_SECRET/,
  );
});

// ---------- Hostaway ----------

test('hostaway: pushRates issues an authorized PUT of calendar intervals', async () => {
  const { impl, calls } = fetchMock((c) => {
    if (isToken(c)) return { body: { access_token: 'htok', expires_in: 3600 } };
    return { body: { status: 'success', result: {} } };
  });
  const adapter = createHostawayAdapter(hostawayEnv(), new InMemoryTokenStore(), { fetchImpl: impl });
  const res = await adapter.pushRates('123', [
    { date: '2026-07-10', price: 180, minStay: 2 },
    { date: '2026-07-11', price: 170 },
  ]);

  assert.equal(res.ok, true);
  const token = calls.find(isToken);
  assert.match(token?.body ?? '', /client_id=acc/);
  const put = calls.find((c) => c.method === 'PUT');
  assert.ok(put, 'expected a PUT calendarIntervals call');
  assert.ok(put.url.endsWith('/listings/123/calendarIntervals'));
  assert.equal(put.headers.authorization, 'Bearer htok');
  assert.deepEqual(JSON.parse(put.body ?? ''), [
    { startDate: '2026-07-10', endDate: '2026-07-10', price: 180, minimumStay: 2 },
    { startDate: '2026-07-11', endDate: '2026-07-11', price: 170 },
  ]);
});

test('hostaway: listings map {result}, promotions are empty (no promo API) and gated by env', async () => {
  const { impl, calls } = fetchMock((c) => {
    if (isToken(c)) return { body: { access_token: 'htok', expires_in: 3600 } };
    return { body: { status: 'success', result: [{ id: 55, name: 'Hostaway Home' }, { id: 56 }] } };
  });
  const adapter = createHostawayAdapter(hostawayEnv(), new InMemoryTokenStore(), { fetchImpl: impl });

  assert.deepEqual(await adapter.getListings(), [
    { id: '55', name: 'Hostaway Home', channels: ['airbnb', 'booking', 'vrbo'] },
    { id: '56', name: '56', channels: ['airbnb', 'booking', 'vrbo'] },
  ]);
  const before = calls.length;
  assert.deepEqual(await adapter.getActivePromotions('55'), []); // docs 09: nothing to list
  assert.equal(calls.length, before); // and no network attempted
  assert.equal(adapter.capabilities.executeOtaPromotions, 'none');
  assert.equal(adapter.capabilities.listOtaPromotions, false);
  assert.throws(() => createHostawayAdapter(loadEnv({})), /HOSTAWAY_ENABLED/);
});

// ---------- Mock adapter (seed-data mode) ----------

test('mock: assignPromotion creates an active store promo visible via getActivePromotions', async () => {
  const store = new MemoryStore(makeState());
  const mock = new MockChannelAdapter(store);
  const r1 = await mock.assignPromotion('L1', move(), 'k1');

  assert.equal(r1.ok, true);
  assert.equal(r1.ref, 'promo_00001');
  assert.match(r1.message ?? '', /synced to booking/);
  const promo = store.getState().promotions[0];
  assert.equal(promo.status, 'active');
  assert.equal(promo.source, 'revpilot');
  assert.equal(promo.createdAt, SIM_DATE);
  assert.deepEqual(promo.window, { start: SIM_DATE, end: '2026-07-16' }); // simDate + 14d default
  const active = await mock.getActivePromotions('L1');
  assert.equal(active.length, 1);
  assert.equal(active[0].type, 'last_minute');
  assert.equal(active[0].depthPct, 0.15);
});

test('mock: assign is idempotent on repeat key AND on identical identity', async () => {
  const store = new MemoryStore(makeState());
  const mock = new MockChannelAdapter(store);
  const r1 = await mock.assignPromotion('L1', move(), 'k1');
  const r2 = await mock.assignPromotion('L1', move(), 'k1');          // same key
  const r3 = await mock.assignPromotion('L1', move(), 'k2');          // new key, same identity

  assert.equal(r2, r1); // cached JobResult object
  assert.equal(r3.ref, r1.ref);
  assert.match(r3.message ?? '', /idempotent no-op/);
  assert.equal(store.getState().promotions.length, 1);
  const r4 = await mock.assignPromotion('L1', move({ channel: 'airbnb' }), 'k3'); // different channel = new promo
  assert.notEqual(r4.ref, r1.ref);
  assert.equal(store.getState().promotions.length, 2);
});

test('mock: unassignPromotion ends the promo (auto-off path)', async () => {
  const store = new MemoryStore(makeState());
  const mock = new MockChannelAdapter(store);
  const r1 = await mock.assignPromotion('L1', move(), 'k1');
  const off = await mock.unassignPromotion('L1', r1.ref ?? '');

  assert.equal(off.ok, true);
  const promo = store.getState().promotions[0];
  assert.equal(promo.status, 'ended');
  assert.equal(promo.endedAt, SIM_DATE);
  assert.equal(promo.endedReason, 'operator');
  assert.deepEqual(await mock.getActivePromotions('L1'), []);
});

// ---------- Guided steps ----------

test('guided steps: every OTA gets a deep link, 3-5 steps, and a strikethrough confirmation', () => {
  for (const channel of ['booking', 'airbnb', 'expedia', 'vrbo'] as const) {
    const step = buildOtaGuidedStep(move({ channel, tier: 'guided', depthPct: 0.1 }));
    assert.ok(step.url.startsWith('https://'), `${channel} needs a deep link`);
    assert.ok(step.steps.length >= 3 && step.steps.length <= 5, `${channel} needs 3-5 steps`);
    assert.ok(step.steps.some((s) => /strikethrough/i.test(s)), `${channel} must confirm the badge`);
    assert.ok(step.steps.some((s) => s.includes('10%')), `${channel} must state the depth`);
  }
  const hostaway = new HostawayAdapter(
    new GuestyTokenManager(new InMemoryTokenStore(), async () => ({ token: 't', ttlMs: 1000 })),
  );
  const hs = hostawayAdapterGuided(hostaway);
  assert.match(hs.url, /dashboard\.hostaway\.com/);
  assert.ok(hs.steps.some((s) => /discount slot/i.test(s)));
  assert.ok(hs.steps.some((s) => /strikethrough/i.test(s)));
  // mock reuses the shared OTA builder
  const mock = new MockChannelAdapter(new MemoryStore(makeState()));
  assert.deepEqual(mock.buildGuidedStep(move({ channel: 'vrbo' })), buildOtaGuidedStep(move({ channel: 'vrbo' })));
});

function hostawayAdapterGuided(a: HostawayAdapter) {
  return a.buildGuidedStep(move({ channel: 'booking', tier: 'guided', depthPct: 0.1 }));
}
