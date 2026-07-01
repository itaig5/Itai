import { test } from 'node:test';
import assert from 'node:assert/strict';
import { depthForDeficit, evaluateFinding, recommendMove } from '../src/rms/rules.ts';
import type { Signals } from '../src/types.ts';

test('depthForDeficit ladder', () => {
  assert.equal(depthForDeficit(-0.2), 0.2);
  assert.equal(depthForDeficit(-0.12), 0.15);
  assert.equal(depthForDeficit(-0.07), 0.1);
  assert.equal(depthForDeficit(-0.03), 0);  // below action threshold
  assert.equal(depthForDeficit(0.1), 0);    // ahead of pace
});

test('evaluateFinding picks the primary signal', () => {
  assert.equal(evaluateFinding(sig({ paceVsStlyPct: 0.15, occupancyDeviation: 0.05 })).signal, 'ahead_of_pace');
  assert.equal(evaluateFinding(sig({ paceVsStlyPct: -0.2, compGapPct: 0.15 })).signal, 'soft_demand_overpriced');
  assert.equal(evaluateFinding(sig({ paceVsStlyPct: -0.2, compGapPct: 0 })).signal, 'soft_demand');
  assert.equal(evaluateFinding(sig({ paceVsStlyPct: 0 })).signal, 'healthy');
});

test('recommendMove: soft+overpriced -> last-minute at ladder depth, api tier', () => {
  const s = sig({ paceVsStlyPct: -0.2, compGapPct: 0.15 });
  const move = recommendMove(evaluateFinding(s), s, { channel: 'booking' });
  assert.equal(move.type, 'last_minute');
  assert.equal(move.depthPct, 0.2);
  assert.equal(move.tier, 'api');
  assert.equal(move.channel, 'booking');
});

test('recommendMove: ahead of pace -> remove discounts', () => {
  const s = sig({ paceVsStlyPct: 0.15, occupancyDeviation: 0.05 });
  assert.equal(recommendMove(evaluateFinding(s), s).type, 'remove_discounts');
});

test('recommendMove: healthy -> none', () => {
  const s = sig({ paceVsStlyPct: 0 });
  assert.equal(recommendMove(evaluateFinding(s), s).type, 'none');
});

test('recommendMove: any Vrbo deal respects the 5% merchandising floor', () => {
  const s = sig({ paceVsStlyPct: -0.2, compGapPct: 0.15 });
  const move = recommendMove(evaluateFinding(s), s, { channel: 'vrbo' });
  assert.ok(move.depthPct >= 0.05);
});

function sig(over: Partial<Signals>): Signals {
  return {
    listingId: 'L1',
    window: { start: '2026-06-01', end: '2026-06-10' },
    occupancy: 0.4,
    targetOccupancy: 0.6,
    occupancyDeviation: -0.2,
    paceVsStlyPct: 0,
    pickup7d: 0,
    adr: 100,
    revpan: 60,
    compGapPct: 0,
    leadTimeDays: 14,
    dataFreshnessTs: '2026-06-01',
    missing: [],
    ...over,
  };
}
