import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  occupancy, adr, revpan, compGap, paceVsStly, pickup,
  medianLeadTime, orphanGaps, pickupOverWindow, computeSignals,
} from '../src/rms/signals.ts';
import type { CalendarNight, OtbSnapshot, Reservation } from '../src/types.ts';

test('occupancy', () => {
  assert.equal(occupancy(6, 10), 0.6);
  assert.equal(occupancy(0, 0), 0);
});

test('adr / revpan', () => {
  assert.equal(adr(700, 7), 100);
  assert.equal(revpan(870, 10), 87);
  assert.equal(adr(0, 0), 0);
});

test('compGap: positive means priced above market', () => {
  assert.equal(compGap(200, 100), 1);
  assert.equal(compGap(90, 100), -0.1);
  assert.equal(compGap(100, 0), 0);
});

test('paceVsStly and pickup', () => {
  assert.equal(paceVsStly(0.4, 0.6), -0.2); // 20pp behind
  assert.equal(pickup(56, 42), 14);
});

test('orphanGaps: only short gaps flanked on both sides', () => {
  const cal: CalendarNight[] = [
    n('2026-06-01', true, true),
    n('2026-06-02', true, true),
    n('2026-06-03', true, false), // gap
    n('2026-06-04', true, false), // gap (len 2)
    n('2026-06-05', true, true),
    n('2026-06-06', true, false), // 3-night gap -> NOT flagged
    n('2026-06-07', true, false),
    n('2026-06-08', true, false),
    n('2026-06-09', true, true),
  ];
  const gaps = orphanGaps(cal, 2);
  assert.equal(gaps.length, 1);
  assert.deepEqual(gaps[0], { start: '2026-06-03', end: '2026-06-04', length: 2 });
});

test('medianLeadTime', () => {
  const res: Reservation[] = [
    r('2026-01-01T00:00:00Z', '2026-01-11'), // 10
    r('2026-01-01T00:00:00Z', '2026-01-06'), // 5
    r('2026-01-01T00:00:00Z', '2026-01-21'), // 20
  ];
  assert.equal(medianLeadTime(res), 10);
});

test('pickupOverWindow picks the snapshot nearest the lookback', () => {
  const snaps: OtbSnapshot[] = [
    s('2026-06-01', 42), s('2026-06-08', 56),
  ];
  assert.equal(pickupOverWindow(snaps, 7), 14);
});

test('computeSignals assembles a full, honest Signals object', () => {
  const cal: CalendarNight[] = Array.from({ length: 10 }, (_, i) =>
    n(`2026-06-${String(i + 1).padStart(2, '0')}`, true, i < 6, 100));
  const sig = computeSignals({
    listingId: 'L1',
    window: { start: '2026-06-01', end: '2026-06-10' },
    calendar: cal,
    targetOccupancy: 0.75,
    stlyOccupancy: 0.8,
    snapshots: [s('2026-06-01', 42), s('2026-06-08', 56)],
    reservations: [r('2026-01-01T00:00:00Z', '2026-01-11')],
    myRate: 200,
    compMedianRate: 130,
    asOf: '2026-06-08',
  });
  assert.equal(sig.occupancy, 0.6);
  assert.equal(sig.occupancyDeviation, -0.15);
  assert.equal(sig.paceVsStlyPct, -0.2);
  assert.equal(sig.adr, 100);
  assert.equal(sig.revpan, 60);
  assert.equal(sig.compGapPct, compGap(200, 130));
  assert.equal(sig.leadTimeDays, 10);
  assert.deepEqual(sig.missing, []); // comp data + >=2 snapshots present
});

// ---- helpers ----
function n(stayDate: string, available: boolean, booked: boolean, price = 100): CalendarNight {
  return { stayDate, available, booked, price, minStay: 1 };
}
function r(bookedAt: string, checkIn: string): Reservation {
  return { id: 'x', listingId: 'L1', checkIn, checkOut: checkIn, bookedAt, nights: 1,
    revenue: 100, roomRevenue: 100, channel: 'booking', status: 'confirmed' };
}
function s(asOf: string, bookedNights: number): OtbSnapshot {
  return { asOf, bookedNights, availableNights: 100, otbRevenue: bookedNights * 100, soldOut: false };
}
