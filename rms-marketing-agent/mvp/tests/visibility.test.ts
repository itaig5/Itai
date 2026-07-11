import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeVisibility, rankRecovery } from '../src/visibility/math.ts';
import { CompositeVisibilityProvider } from '../src/visibility/provider.ts';
import type { VisibilityAdapter } from '../src/visibility/provider.ts';
import {
  StoreBackedOperatorInputAdapter, parseOperatorVisibilityCsv, buildManualEntry,
} from '../src/visibility/operatorInput.ts';
import { StoreBackedPublicRankAdapter } from '../src/visibility/publicRank.ts';
import { BookingMarketInsightsAdapter, buildInsightsRequest } from '../src/visibility/bookingMarketInsights.ts';
import { GuestyReviewsAdapter, normalizeReviewScore } from '../src/visibility/reviews.ts';
import { MemoryStore, DEFAULT_SETTINGS } from '../src/store/store.ts';
import type { RevPilotState } from '../src/store/store.ts';
import { loadEnv } from '../src/config/env.ts';
import type { VisibilityObservation, VisibilitySource } from '../src/types.ts';

const L = 'l1';
const ASOF = '2026-07-02';

function ob(p: Partial<VisibilityObservation> & { observedAt: string; source: VisibilitySource }): VisibilityObservation {
  return { listingId: L, platform: 'booking', ...p };
}

function makeState(observations: VisibilityObservation[]): RevPilotState {
  return {
    seed: 1, simDate: ASOF,
    clients: [],
    users: [],
    listings: [], calendar: {}, reservations: [], snapshots: {},
    stlyOccupancy: {}, compMedianRate: {},
    visibilityObservations: observations,
    promotions: [], recommendations: [], outcomes: [], audit: [],
    settings: DEFAULT_SETTINGS,
    banditState: {}, banditModel: 'none', counters: {},
  };
}

function fixtureAdapter(id: string, source: VisibilitySource, observations: VisibilityObservation[]): VisibilityAdapter {
  return {
    id, source,
    async fetchObservations(listingId, platform) {
      return observations.filter((o) => o.listingId === listingId && o.platform === platform);
    },
  };
}

function jsonFetch(body: unknown, capture?: { url?: string; init?: RequestInit }): typeof fetch {
  return (async (input: unknown, init?: RequestInit) => {
    if (capture) { capture.url = String(input); capture.init = init; }
    return new Response(JSON.stringify(body), { status: 200 });
  }) as typeof fetch;
}

// asOf 2026-07-02 -> 14d lookback target = 2026-06-18; 06-19 (1d off) beats 06-10 (8d off).
const rankFixture = [
  ob({ observedAt: '2026-06-10', source: 'public_rank', rank: 4 }),
  ob({ observedAt: '2026-06-19', source: 'public_rank', rank: 6 }),
  ob({ observedAt: '2026-07-02', source: 'public_rank', rank: 12 }),
  ob({ observedAt: '2026-07-02', source: 'operator_input', rank: 30 }),
];

test('rank merge prefers public_rank; trend uses the observation nearest to asOf-14d', () => {
  const v = summarizeVisibility(L, 'booking', rankFixture, ASOF);
  assert.equal(v.rank, 12);            // public_rank wins over the same-day operator rank of 30
  assert.equal(v.rankTrend14d, 6);     // 12 - 6 (nearest-to-14d), NOT 12 - 4 (oldest)
  assert.equal(v.dataFreshnessTs, '2026-07-02');
  assert.deepEqual(v.sources, ['public_rank', 'operator_input']);
});

test('drop detected on rank fall >= 5 positions over 14d', () => {
  const v = summarizeVisibility(L, 'booking', rankFixture, ASOF);
  assert.equal(v.dropDetected, true);
  assert.match(v.dropReason ?? '', /rank fell 6 positions/);
  assert.ok(v.missing.includes('impressions') && v.missing.includes('conversion'));
});

test('drop detected on impressions down >= 25% week-over-week', () => {
  const v = summarizeVisibility(L, 'booking', [
    ob({ observedAt: '2026-06-25', source: 'operator_input', searchImpressions: 1000 }),
    ob({ observedAt: '2026-07-02', source: 'operator_input', searchImpressions: 700 }),
  ], ASOF);
  assert.equal(v.impressions7d, 700);
  assert.equal(v.impressionsTrendPct, -0.3);
  assert.equal(v.dropDetected, true);
  assert.match(v.dropReason ?? '', /impressions down 30%/);
  assert.ok(v.missing.includes('rank')); // rank absent -> reported missing, but no rank drop fired
});

test('drop detected on conversion falling >= 40% vs previous observation', () => {
  const v = summarizeVisibility(L, 'booking', [
    ob({ observedAt: '2026-06-20', source: 'operator_input', conversion: 0.05 }),
    ob({ observedAt: '2026-07-01', source: 'operator_input', conversion: 0.028 }),
  ], ASOF);
  assert.equal(v.conversion, 0.028);
  assert.equal(v.dropDetected, true);
  assert.match(v.dropReason ?? '', /conversion fell 44%/);

  const mild = summarizeVisibility(L, 'booking', [
    ob({ observedAt: '2026-06-20', source: 'operator_input', conversion: 0.05 }),
    ob({ observedAt: '2026-07-01', source: 'operator_input', conversion: 0.04 }),
  ], ASOF);
  assert.equal(mild.dropDetected, false); // 20% fall is under the 40% threshold
});

test('no drop when metrics are missing; reviewScore comes only from the reviews source', () => {
  const v = summarizeVisibility(L, 'booking', [
    ob({ observedAt: '2026-06-30', source: 'operator_input', ctr: 0.041 }),
    ob({ observedAt: '2026-07-01', source: 'reviews', reviewScore: 8.7 }),
  ], ASOF);
  assert.equal(v.dropDetected, false);
  assert.equal(v.dropReason, null);
  assert.equal(v.ctr, 0.041);
  assert.equal(v.reviewScore, 8.7);
  assert.deepEqual(v.missing, ['rank', 'impressions', 'conversion']);

  const operatorOnlyScore = summarizeVisibility(L, 'booking', [
    ob({ observedAt: '2026-07-01', source: 'operator_input', reviewScore: 9.9 }),
  ], ASOF);
  assert.equal(operatorOnlyScore.reviewScore, null); // not from the reviews source
});

test('observations after asOf are ignored by the summary', () => {
  const v = summarizeVisibility(L, 'booking', [
    ob({ observedAt: '2026-07-01', source: 'public_rank', rank: 9 }),
    ob({ observedAt: '2026-07-09', source: 'public_rank', rank: 2 }), // future vs asOf
  ], ASOF);
  assert.equal(v.rank, 9);
  assert.equal(v.rankTrend14d, null); // only one usable rank point
});

test('parseOperatorVisibilityCsv keeps good rows, trims, skips malformed rows', () => {
  const csv = [
    'listingId,platform,observedAt,rank,searchImpressions,ctr,conversion',
    'l1,airbnb,2026-07-01,12,900,0.04,0.02',
    ' l1 , booking , 2026-07-01 , , 1200 , , ',   // optional fields empty + whitespace
    'l1,tripadvisor,2026-07-01,3,,,',             // bad platform -> skip
    ',airbnb,2026-07-01,3,,,',                    // missing listingId -> skip
    'l1,airbnb,not-a-date,3,,,',                  // bad date -> skip
    'l1,airbnb,2026-07-01,abc,,,',                // non-numeric rank -> skip
    '',
  ].join('\n');
  const rows = parseOperatorVisibilityCsv(csv);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {
    listingId: 'l1', platform: 'airbnb', observedAt: '2026-07-01',
    source: 'operator_input', rank: 12, searchImpressions: 900, ctr: 0.04, conversion: 0.02,
  });
  assert.equal(rows[1].platform, 'booking');
  assert.equal(rows[1].searchImpressions, 1200);
  assert.equal(rows[1].rank, undefined);
  assert.equal(rows[1].source, 'operator_input');
});

test('buildManualEntry stamps the operator_input source', () => {
  const e = buildManualEntry({ listingId: L, platform: 'expedia', observedAt: ASOF, rank: 7, ctr: 0.03 });
  assert.equal(e.source, 'operator_input');
  assert.equal(e.platform, 'expedia');
  assert.equal(e.rank, 7);
  assert.equal(e.ctr, 0.03);
});

test('composite merges observations across adapters and unions programs (latest flag wins)', async () => {
  const a = fixtureAdapter('rank_fixture', 'public_rank', [
    ob({ observedAt: '2026-06-20', source: 'public_rank', rank: 5, programs: [{ program: 'genius', enrolled: false }] }),
    ob({ observedAt: '2026-07-02', source: 'public_rank', rank: 3 }),
  ]);
  const b = fixtureAdapter('operator_fixture', 'operator_input', [
    ob({
      observedAt: '2026-07-01', source: 'operator_input', ctr: 0.05,
      programs: [{ program: 'genius', enrolled: true }, { program: 'preferred_partner', enrolled: false }],
    }),
  ]);
  const composite = new CompositeVisibilityProvider([a, b]);
  const out = await composite.getVisibility(L, ['booking'], ASOF);
  assert.equal(out.length, 1);
  const v = out[0];
  assert.equal(v.rank, 3);
  assert.equal(v.ctr, 0.05);
  assert.deepEqual(v.sources, ['public_rank', 'operator_input']);
  assert.deepEqual(
    [...v.programs].sort((x, y) => x.program.localeCompare(y.program)),
    [{ program: 'genius', enrolled: true }, { program: 'preferred_partner', enrolled: false }],
  );
  assert.deepEqual(composite.failedAdapterIds, []);
});

test('a failing adapter does not break the composite; its metrics land in missing[]', async () => {
  const boom: VisibilityAdapter = {
    id: 'boom', source: 'operator_input',
    async fetchObservations() { throw new Error('network down'); },
  };
  const ok = fixtureAdapter('rank_fixture', 'public_rank', [
    ob({ observedAt: '2026-07-02', source: 'public_rank', rank: 4 }),
  ]);
  const composite = new CompositeVisibilityProvider([boom, ok]);
  const out = await composite.getVisibility(L, ['booking', 'airbnb'], ASOF);
  assert.equal(out.length, 2);
  assert.equal(out[0].rank, 4);
  assert.ok(out[0].missing.includes('ctr'));       // the broken source's metrics are just absent
  assert.deepEqual(composite.failedAdapterIds, ['boom']);
});

test('rankRecovery measures positions regained; null when a rank is missing', () => {
  const before = summarizeVisibility(L, 'booking', [ob({ observedAt: '2026-06-20', source: 'public_rank', rank: 20 })], ASOF);
  const after = summarizeVisibility(L, 'booking', [ob({ observedAt: ASOF, source: 'public_rank', rank: 12 })], ASOF);
  const none = summarizeVisibility(L, 'booking', [], ASOF);
  assert.equal(rankRecovery(before, after), 8);
  assert.equal(rankRecovery(before, none), null);
  assert.equal(rankRecovery(none, after), null);
});

test('StoreBacked adapters filter by listing, platform, source and observedAt <= asOf', async () => {
  const store = new MemoryStore(makeState([
    ob({ observedAt: '2026-06-28', source: 'operator_input', ctr: 0.04 }),
    ob({ observedAt: '2026-07-05', source: 'operator_input', ctr: 0.09 }),          // future -> excluded
    ob({ observedAt: '2026-06-28', source: 'public_rank', rank: 6 }),               // other source
    { ...ob({ observedAt: '2026-06-28', source: 'operator_input', ctr: 0.02 }), listingId: 'l2' },
    { ...ob({ observedAt: '2026-06-28', source: 'operator_input', ctr: 0.01 }), platform: 'vrbo' },
  ]));
  const operator = new StoreBackedOperatorInputAdapter(store);
  const opRows = await operator.fetchObservations(L, 'booking', ASOF);
  assert.equal(opRows.length, 1);
  assert.equal(opRows[0].ctr, 0.04);

  const rank = new StoreBackedPublicRankAdapter(store);
  const rankRows = await rank.fetchObservations(L, 'booking', ASOF);
  assert.equal(rankRows.length, 1);
  assert.equal(rankRows[0].rank, 6);
});

test('BookingMarketInsightsAdapter: gated off -> []; enabled -> mapped observation without funnel', async () => {
  const off = new BookingMarketInsightsAdapter(loadEnv({}), jsonFetch({}));
  assert.deepEqual(await off.fetchObservations(L, 'booking', ASOF), []);

  const capture: { url?: string; init?: RequestInit } = {};
  const env = loadEnv({ BOOKING_INSIGHTS_ENABLED: 'true', BOOKING_INSIGHTS_TOKEN: 't0k' });
  const on = new BookingMarketInsightsAdapter(env, jsonFetch({
    sales_statistics_report_data: { conversion: 0.031 },
    pace_report_data: {},
  }, capture));
  assert.deepEqual(await on.fetchObservations(L, 'airbnb', ASOF), []); // Booking-only API
  const rows = await on.fetchObservations(L, 'booking', ASOF);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].conversion, 0.031);
  assert.equal(rows[0].searchImpressions, undefined); // the funnel is NOT in this API (doc 11)
  assert.equal(rows[0].source, 'market_insights');
  assert.match(capture.url ?? '', /hub-api\.booking\.com/);
  assert.equal(JSON.parse(String(capture.init?.body)).report_types.length, 4);
  assert.deepEqual(JSON.parse(String(capture.init?.body)), buildInsightsRequest(L, ASOF));

  const broken = new BookingMarketInsightsAdapter(env, (async () => { throw new Error('502'); }) as typeof fetch);
  assert.deepEqual(await broken.fetchObservations(L, 'booking', ASOF), []); // errors never escape
});

test('GuestyReviewsAdapter normalizes native scales to 0..10 and respects the env gate', async () => {
  assert.equal(normalizeReviewScore(4.7, 'airbnb'), 9.4);
  assert.equal(normalizeReviewScore(8.6, 'booking'), 8.6);

  const off = new GuestyReviewsAdapter(loadEnv({}), async () => 'tok', jsonFetch({ results: [] }));
  assert.deepEqual(await off.fetchObservations(L, 'airbnb', ASOF), []);

  const env = loadEnv({ GUESTY_ENABLED: 'true' });
  const body = {
    results: [
      { rating: 4.8, channel: 'airbnb' },
      { rating: 4.6, channel: 'airbnb' },
      { rating: 9.0, channel: 'booking' }, // other platform -> excluded from the airbnb average
    ],
  };
  const on = new GuestyReviewsAdapter(env, async () => 'tok', jsonFetch(body));
  const rows = await on.fetchObservations(L, 'airbnb', ASOF);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].reviewScore, 9.4); // avg(4.8, 4.6) = 4.7 -> *2
  assert.equal(rows[0].source, 'reviews');
});
