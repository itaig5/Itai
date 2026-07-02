import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ARM_CATALOG, armId, candidatesFor, contextBucket } from '../src/learning/arms.ts';
import { computeReward } from '../src/learning/rewards.ts';
import { banditStateView, chooseArm, updateArm } from '../src/learning/tsBandit.ts';
import type { BanditState } from '../src/learning/tsBandit.ts';
import { buildContext, featureRow } from '../src/learning/featureStore.ts';
import { BanditClient } from '../src/learning/banditClient.ts';
import { ForecastClient, pickupForecast } from '../src/learning/forecastClient.ts';
import { DEFAULT_SETTINGS, MemoryStore } from '../src/store/store.ts';
import type { RevPilotState } from '../src/store/store.ts';
import { loadEnv } from '../src/config/env.ts';
import type { BanditContext, OtbSnapshot, Platform, Signals, VisibilitySignals } from '../src/types.ts';

function makeState(): RevPilotState {
  return {
    seed: 1,
    simDate: '2026-07-02',
    listings: [],
    calendar: {},
    reservations: [],
    snapshots: {},
    stlyOccupancy: {},
    compMedianRate: {},
    visibilityObservations: [],
    promotions: [],
    recommendations: [],
    outcomes: [],
    audit: [],
    settings: DEFAULT_SETTINGS,
    banditState: {},
    banditModel: 'ts-thompson-v1',
    counters: {},
  };
}

function ctx(overrides: Partial<BanditContext> = {}): BanditContext {
  return {
    occupancyDeviation: -0.1,
    paceVsStlyPct: -0.1, // deficit 0.10 -> d1
    compGapPct: 0,
    leadTimeDays: 10,
    pickup7d: 2,
    visibilityDrop: 0,
    ...overrides,
  };
}

function sig(overrides: Partial<Signals> = {}): Signals {
  return {
    listingId: 'l1',
    window: { start: '2026-07-03', end: '2026-07-17' },
    occupancy: 0.5,
    targetOccupancy: 0.7,
    occupancyDeviation: -0.2,
    paceVsStlyPct: -0.1,
    pickup7d: 3,
    adr: 150,
    revpan: 75,
    compGapPct: 0.1,
    leadTimeDays: 12,
    dataFreshnessTs: '2026-07-02T00:00:00Z',
    missing: [],
    ...overrides,
  };
}

function vis(platform: Platform, rank: number | null, dropDetected: boolean): VisibilitySignals {
  return {
    listingId: 'l1',
    platform,
    rank,
    rankTrend14d: null,
    impressions7d: null,
    impressionsTrendPct: null,
    ctr: null,
    conversion: null,
    reviewScore: null,
    programs: [],
    dropDetected,
    dropReason: dropDetected ? 'rank drop' : null,
    dataFreshnessTs: '2026-07-02',
    sources: ['public_rank'],
    missing: [],
  };
}

function snap(asOf: string, bookedNights: number, availableNights = 30): OtbSnapshot {
  return { asOf, bookedNights, availableNights, otbRevenue: 0, soldOut: false };
}

const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} !~ ${b}`);

// --- rewards ---

test('computeReward: exact values for known inputs', () => {
  // 0.4*0.7 + 0.4*0.7 + 0.2*0.5
  assert.equal(
    computeReward({ bookingLift: 0.1, revenueLift: 10, visibilityChange: null, baselineRevpan: 100 }),
    0.66,
  );
  // all null -> exactly neutral
  assert.equal(
    computeReward({ bookingLift: null, revenueLift: null, visibilityChange: null, baselineRevpan: 100 }),
    0.5,
  );
  // revpan denominator floors at 1: 0.4*0.5 + 0.4*0.75 + 0.2*0.5
  assert.equal(
    computeReward({ bookingLift: null, revenueLift: 0.25, visibilityChange: null, baselineRevpan: 0 }),
    0.6,
  );
  // visibility term: +5 ranks recovered -> normVis 0.75 -> 0.2+0.2+0.15
  assert.equal(
    computeReward({ bookingLift: 0, revenueLift: 0, visibilityChange: 5, baselineRevpan: 100 }),
    0.55,
  );
});

test('computeReward: clamps every component at both ends', () => {
  assert.equal(
    computeReward({ bookingLift: 5, revenueLift: 1000, visibilityChange: 100, baselineRevpan: 10 }),
    1,
  );
  assert.equal(
    computeReward({ bookingLift: -5, revenueLift: -1000, visibilityChange: -100, baselineRevpan: 10 }),
    0,
  );
});

// --- arms / context bucket ---

test('contextBucket: deficit boundaries at exactly 0.05 and 0.15, compGap at exactly 0.08', () => {
  assert.equal(contextBucket(ctx({ paceVsStlyPct: -0.049 })), 'd0|v0|c0');
  assert.equal(contextBucket(ctx({ paceVsStlyPct: -0.05 })), 'd1|v0|c0');   // boundary -> d1
  assert.equal(contextBucket(ctx({ paceVsStlyPct: -0.149 })), 'd1|v0|c0');
  assert.equal(contextBucket(ctx({ paceVsStlyPct: -0.15 })), 'd2|v0|c0');   // boundary -> d2
  assert.equal(contextBucket(ctx({ paceVsStlyPct: 0.2 })), 'd0|v0|c0');     // ahead of pace
  assert.equal(contextBucket(ctx({ compGapPct: 0.079 })), 'd1|v0|c0');
  assert.equal(contextBucket(ctx({ compGapPct: 0.08 })), 'd1|v0|c1');       // boundary -> c1
});

test('contextBucket: visibilityDrop flag maps to v1', () => {
  assert.equal(contextBucket(ctx({ visibilityDrop: 1, paceVsStlyPct: -0.2, compGapPct: 0.1 })), 'd2|v1|c1');
});

test('ARM_CATALOG: 10 arms with the shared id format', () => {
  assert.equal(ARM_CATALOG.length, 10);
  assert.equal(armId({ type: 'last_minute', depthPct: 0.1 }), 'last_minute@0.10');
  assert.deepEqual(
    ARM_CATALOG.map(armId).sort(),
    [
      'basic_deal@0.10', 'basic_deal@0.15', 'basic_deal@0.20',
      'early_booker@0.10', 'early_booker@0.15',
      'last_minute@0.10', 'last_minute@0.15', 'last_minute@0.20',
      'weekly_los@0.10', 'weekly_los@0.15',
    ],
  );
});

test('candidatesFor: anchor depth keeps arms within one ladder step, per type', () => {
  assert.deepEqual(candidatesFor(['last_minute'], 0.15).map(armId),
    ['last_minute@0.10', 'last_minute@0.15', 'last_minute@0.20']);
  assert.deepEqual(candidatesFor(['last_minute'], 0.2).map(armId),
    ['last_minute@0.15', 'last_minute@0.20']);
  assert.deepEqual(candidatesFor(['early_booker', 'weekly_los'], 0.1).map(armId),
    ['early_booker@0.10', 'early_booker@0.15', 'weekly_los@0.10', 'weekly_los@0.15']);
});

test('candidatesFor: no arm near the anchor -> falls back to all arms of those types', () => {
  assert.deepEqual(candidatesFor(['early_booker'], 0.5).map(armId),
    ['early_booker@0.10', 'early_booker@0.15']);
  assert.deepEqual(candidatesFor(['remove_discounts'], 0.1), []); // type not in catalog
});

// --- Thompson sampling ---

test('chooseArm: deterministic for a seed; different seeds can pick different arms', () => {
  const state: BanditState = {};
  const cands = candidatesFor(['last_minute', 'basic_deal'], 0.15);
  const a = chooseArm(state, ctx(), cands, 'seed-1');
  const b = chooseArm(state, ctx(), cands, 'seed-1');
  assert.deepEqual(a, b);
  assert.equal(a.model, 'ts-thompson-v1');
  const distinct = new Set<string>();
  for (let s = 0; s < 50; s++) distinct.add(armId(chooseArm(state, ctx(), cands, s).arm));
  assert.ok(distinct.size > 1, 'uniform priors should explore across seeds');
});

test('chooseArm: never returns an arm outside the candidate list', () => {
  const state: BanditState = {};
  const cands = [{ type: 'early_booker' as const, depthPct: 0.1 }, { type: 'weekly_los' as const, depthPct: 0.15 }];
  const ids = new Set(cands.map(armId));
  for (let s = 0; s < 100; s++) {
    assert.ok(ids.has(armId(chooseArm(state, ctx(), cands, s).arm)));
  }
});

test('chooseArm: empty candidates throws', () => {
  assert.throws(() => chooseArm({}, ctx(), [], 1));
});

test('updateArm: alpha/beta/pulls math with reward clamped to [0,1]', () => {
  const state: BanditState = {};
  const arm = { type: 'last_minute' as const, depthPct: 0.1 };
  const key = 'd1|v0|c0|last_minute@0.10';
  updateArm(state, ctx(), arm, 0.66);
  close(state[key].alpha, 1.66);
  close(state[key].beta, 1.34);
  assert.equal(state[key].pulls, 1);
  updateArm(state, ctx(), arm, 2); // clamps to 1
  close(state[key].alpha, 2.66);
  close(state[key].beta, 1.34);
  updateArm(state, ctx(), arm, -1); // clamps to 0
  close(state[key].alpha, 2.66);
  close(state[key].beta, 2.34);
  assert.equal(state[key].pulls, 3);
});

test('chooseArm: explore=true exactly when the chosen arm lacks the max posterior mean', () => {
  const state: BanditState = {
    'd1|v0|c0|last_minute@0.10': { alpha: 8, beta: 2, pulls: 10 }, // mean 0.8 (the exploit arm)
    'd1|v0|c0|last_minute@0.15': { alpha: 2, beta: 2, pulls: 4 },  // mean 0.5
  };
  const cands = [
    { type: 'last_minute' as const, depthPct: 0.1 },
    { type: 'last_minute' as const, depthPct: 0.15 },
  ];
  let sawExplore = false;
  let sawExploit = false;
  for (let s = 0; s < 300; s++) {
    const c = chooseArm(state, ctx(), cands, s);
    if (armId(c.arm) === 'last_minute@0.15') {
      assert.equal(c.explore, true);
      sawExplore = true;
    } else {
      assert.equal(c.explore, false);
      sawExploit = true;
    }
  }
  assert.ok(sawExplore && sawExploit, 'expected both explore and exploit picks across 300 seeds');
});

test('banditStateView: sorted by bucket then armId, mean rounded 4dp', () => {
  const state: BanditState = {
    'd2|v1|c0|last_minute@0.10': { alpha: 2, beta: 1, pulls: 2 },
    'd0|v0|c0|weekly_los@0.15': { alpha: 1, beta: 1, pulls: 0 },
    'd0|v0|c0|basic_deal@0.20': { alpha: 1.5, beta: 1.5, pulls: 1 },
  };
  const view = banditStateView(state);
  assert.deepEqual(view.map((r) => `${r.bucket}|${r.armId}`), [
    'd0|v0|c0|basic_deal@0.20',
    'd0|v0|c0|weekly_los@0.15',
    'd2|v1|c0|last_minute@0.10',
  ]);
  assert.equal(view[0].mean, 0.5);
  assert.equal(view[2].mean, 0.6667);
  assert.equal(view[2].pulls, 2);
});

// --- BanditClient ---

test('BanditClient: service down -> ts fallback choice, update still mutates the store', async () => {
  const store = new MemoryStore(makeState());
  const down = (() => Promise.reject(new Error('down'))) as unknown as typeof fetch;
  const client = new BanditClient(store, loadEnv({}), down);
  const cands = candidatesFor(['last_minute'], 0.15);
  const ids = new Set(cands.map(armId));

  const choice = await client.choose(ctx(), cands, 'demo-seed');
  assert.equal(choice.model, 'ts-thompson-v1');
  assert.ok(ids.has(armId(choice.arm)));
  assert.ok(choice.score >= 0 && choice.score <= 1);

  const upd = await client.update(ctx(), choice.arm, 0.8);
  assert.equal(upd.model, 'ts-thompson-v1');
  const p = store.getState().banditState[`d1|v0|c0|${armId(choice.arm)}`];
  close(p.alpha, 1.8);
  close(p.beta, 1.2);
  assert.equal(p.pulls, 1);

  const view = await client.stateView();
  assert.equal(view.model, 'ts-thompson-v1');
  assert.equal(view.remote, null);
  assert.equal(view.local.length, 1);
});

test('BanditClient: service up -> ml: model prefix, local posterior still updated', async () => {
  const store = new MemoryStore(makeState());
  const remoteChoice = { arm: { type: 'basic_deal', depthPct: 0.15 }, score: 0.71, explore: false, model: 'thompson-v1' };
  const up = (async (url: string | URL | Request) => ({
    ok: true,
    json: async () => (String(url).endsWith('/bandit/choose') ? remoteChoice : { ok: true }),
  })) as unknown as typeof fetch;
  const client = new BanditClient(store, loadEnv({}), up);

  const choice = await client.choose(ctx(), candidatesFor(['basic_deal'], 0.15), 7);
  assert.equal(choice.model, 'ml:thompson-v1');
  assert.deepEqual(choice.arm, remoteChoice.arm);

  const upd = await client.update(ctx(), choice.arm, 0.5);
  assert.equal(upd.model, 'ml:+ts-thompson-v1');
  const p = store.getState().banditState['d1|v0|c0|basic_deal@0.15'];
  close(p.alpha, 1.5);
  assert.equal(p.pulls, 1); // dashboard state updates even when the service is up
});

// --- forecasting ---

test('pickupForecast: additive projection from the last 14 days, capped at availableNights', () => {
  const days = ['2026-06-25', '2026-06-26', '2026-06-27', '2026-06-28', '2026-06-29', '2026-06-30', '2026-07-01'];
  const snaps = days.map((d, i) => snap(d, 10 + 2 * i)); // +2 nights/day, availableNights 30
  const points = pickupForecast(snaps, 5);
  assert.deepEqual(points, [
    { ds: '2026-07-02', yhat: 24 },
    { ds: '2026-07-03', yhat: 26 },
    { ds: '2026-07-04', yhat: 28 },
    { ds: '2026-07-05', yhat: 30 },
    { ds: '2026-07-06', yhat: 30 }, // 32 capped at capacity
  ]);
});

test('pickupForecast: single snapshot -> flat (zero pickup rate); empty inputs -> []', () => {
  const points = pickupForecast([snap('2026-07-01', 12)], 3);
  assert.deepEqual(points, [
    { ds: '2026-07-02', yhat: 12 },
    { ds: '2026-07-03', yhat: 12 },
    { ds: '2026-07-04', yhat: 12 },
  ]);
  assert.deepEqual(pickupForecast([], 5), []);
  assert.deepEqual(pickupForecast([snap('2026-07-01', 12)], 0), []);
});

test('ForecastClient: service down -> pickup-baseline over the series', async () => {
  const down = (() => Promise.reject(new Error('down'))) as unknown as typeof fetch;
  const client = new ForecastClient(loadEnv({}), down);
  const series = [
    { ds: '2026-06-29', y: 10 },
    { ds: '2026-06-30', y: 13 },
    { ds: '2026-07-01', y: 16 },
  ];
  const out = await client.forecast(series, 2);
  assert.equal(out.model, 'pickup-baseline');
  assert.deepEqual(out.points, [
    { ds: '2026-07-02', yhat: 19 },
    { ds: '2026-07-03', yhat: 22 },
  ]);
});

// --- feature store ---

test('buildContext: visibilityDrop=1 iff any platform has dropDetected', () => {
  const none = buildContext(sig());
  assert.equal(none.visibilityDrop, 0);
  const clean = buildContext(sig({ visibility: [vis('booking', 5, false)] }));
  assert.equal(clean.visibilityDrop, 0);
  const dropped = buildContext(sig({ visibility: [vis('booking', 5, false), vis('airbnb', 9, true)] }));
  assert.equal(dropped.visibilityDrop, 1);
  assert.equal(dropped.paceVsStlyPct, -0.1);
  assert.equal(dropped.compGapPct, 0.1);
});

test('featureRow: flat numeric row with bestRank and orphanGapCount defaults', () => {
  const row = featureRow(sig({ visibility: [vis('booking', 5, true), vis('airbnb', 3, false), vis('vrbo', null, false)] }));
  assert.equal(row.bestRank, 3);
  assert.equal(row.visibilityDrop, 1);
  assert.equal(row.orphanGapCount, 0);
  assert.equal(row.occupancy, 0.5);
  assert.equal(row.paceVsStlyPct, -0.1);
  const bare = featureRow(sig({ orphanGapCount: 2 }));
  assert.equal(bare.bestRank, -1);
  assert.equal(bare.visibilityDrop, 0);
  assert.equal(bare.orphanGapCount, 2);
  for (const v of Object.values(bare)) assert.equal(typeof v, 'number');
});
