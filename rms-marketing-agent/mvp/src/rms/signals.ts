// Mini-RMS signal computation. Pure, deterministic, explainable.
// These are the numbers the LLM agent is NEVER allowed to compute itself.
import type { CalendarNight, OtbSnapshot, Reservation, Signals } from '../types.ts';

const DAY_MS = 86_400_000;

export function round(n: number, d = 4): number {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

/** Occupancy = booked / available (bookable) nights. */
export function occupancy(bookedNights: number, availableNights: number): number {
  if (availableNights <= 0) return 0;
  return round(bookedNights / availableNights);
}

export function adr(roomRevenue: number, bookedNights: number): number {
  if (bookedNights <= 0) return 0;
  return round(roomRevenue / bookedNights, 2);
}

/** Revenue per available night — the STR-native yield metric. */
export function revpan(totalRevenue: number, availableNights: number): number {
  if (availableNights <= 0) return 0;
  return round(totalRevenue / availableNights, 2);
}

/** Positive = you are priced ABOVE the market median. */
export function compGap(myRate: number, compMedian: number): number {
  if (compMedian <= 0) return 0;
  return round((myRate - compMedian) / compMedian);
}

/** Pace vs same-time-last-year, in occupancy percentage points. STLY must be day-of-week aligned upstream. */
export function paceVsStly(occNow: number, occStly: number): number {
  return round(occNow - occStly);
}

/** Net new booked nights between two on-the-books levels. */
export function pickup(otbNow: number, otbPrior: number): number {
  return otbNow - otbPrior;
}

/** Median days between booking and check-in. */
export function medianLeadTime(reservations: Reservation[]): number {
  const days = reservations
    .filter((r) => r.status === 'confirmed')
    .map((r) => Math.max(0, Math.round((Date.parse(r.checkIn) - Date.parse(r.bookedAt)) / DAY_MS)))
    .sort((a, b) => a - b);
  if (days.length === 0) return 0;
  const mid = Math.floor(days.length / 2);
  return days.length % 2 ? days[mid] : Math.round((days[mid - 1] + days[mid]) / 2);
}

export interface OrphanGap {
  start: string;
  end: string;
  length: number;
}

/** Unbooked runs of length <= maxGap flanked on BOTH sides by booked nights (perishable, zero-revenue). */
export function orphanGaps(calendar: CalendarNight[], maxGap = 2): OrphanGap[] {
  const nights = [...calendar].sort((a, b) => a.stayDate.localeCompare(b.stayDate));
  const gaps: OrphanGap[] = [];
  let i = 0;
  while (i < nights.length) {
    if (nights[i].available && !nights[i].booked) {
      let j = i;
      while (j < nights.length && nights[j].available && !nights[j].booked) j++;
      const runLen = j - i;
      const leftBooked = i > 0 && nights[i - 1].booked;
      const rightBooked = j < nights.length && nights[j].booked;
      if (runLen <= maxGap && leftBooked && rightBooked) {
        gaps.push({ start: nights[i].stayDate, end: nights[j - 1].stayDate, length: runLen });
      }
      i = j;
    } else {
      i++;
    }
  }
  return gaps;
}

/** Net booked-night change over the last `days`, using the snapshot nearest to that lookback point. */
export function pickupOverWindow(snapshots: OtbSnapshot[], days = 7): number {
  if (snapshots.length < 2) return 0;
  const sorted = [...snapshots].sort((a, b) => a.asOf.localeCompare(b.asOf));
  const latest = sorted[sorted.length - 1];
  const targetTs = Date.parse(latest.asOf) - days * DAY_MS;
  let prior = sorted[0];
  let best = Infinity;
  for (const s of sorted) {
    const d = Math.abs(Date.parse(s.asOf) - targetTs);
    if (d < best) {
      best = d;
      prior = s;
    }
  }
  return pickup(latest.bookedNights, prior.bookedNights);
}

export interface SignalInputs {
  listingId: string;
  window: { start: string; end: string };
  calendar: CalendarNight[];      // nights inside the window
  targetOccupancy: number;        // 0..1
  stlyOccupancy: number;          // day-of-week-aligned STLY occupancy for this window
  snapshots: OtbSnapshot[];       // recent daily OTB snapshots (pace history)
  reservations: Reservation[];    // for lead-time
  myRate: number;                 // your current median rate for the window
  compMedianRate: number;         // public comp-set median (Wheelhouse/AirROI) — 0 if unavailable
  asOf: string;
}

/** Assemble a full Signals object; records anything missing so the agent can degrade to NO_ACTION. */
export function computeSignals(inp: SignalInputs): Signals {
  const missing: string[] = [];
  const bookable = inp.calendar.filter((n) => n.available);
  const availableNights = bookable.length;
  const bookedNights = bookable.filter((n) => n.booked).length;
  const roomRevenue = bookable.filter((n) => n.booked).reduce((s, n) => s + n.price, 0);

  const occ = occupancy(bookedNights, availableNights);
  if (inp.compMedianRate <= 0) missing.push('compMedianRate');
  if (inp.snapshots.length < 2) missing.push('otbSnapshots');

  return {
    listingId: inp.listingId,
    window: inp.window,
    occupancy: occ,
    targetOccupancy: round(inp.targetOccupancy),
    occupancyDeviation: round(occ - inp.targetOccupancy),
    paceVsStlyPct: paceVsStly(occ, inp.stlyOccupancy),
    pickup7d: pickupOverWindow(inp.snapshots, 7),
    adr: adr(roomRevenue, bookedNights),
    revpan: revpan(roomRevenue, availableNights),
    compGapPct: compGap(inp.myRate, inp.compMedianRate),
    leadTimeDays: medianLeadTime(inp.reservations),
    dataFreshnessTs: inp.asOf,
    missing,
  };
}
