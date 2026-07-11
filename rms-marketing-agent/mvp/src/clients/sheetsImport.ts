// Real-client onboarding WITHOUT a PMS/OTA API: operators (or their revenue manager) keep a
// weekly on-the-books log per stay-month in a spreadsheet — as-of date, room nights, income,
// targets, expected ADR, and same-time-last-year. That IS the pace-curve dataset the brain
// runs on. This module parses the canonical CSV export of that sheet and materializes a
// property the whole engine (signals -> recommendations -> guided execution) can reason over.
//
// Canonical CSV (one row per as-of × stay-month; header names are matched case-insensitively,
// common synonyms accepted):
//   property,rooms,month,asOf,roomNights,income,occTarget,revenueTarget,expectedAdr,stlyRoomNights,stlyIncome
//   Harbor House,19,2026-06,2026-01-25,210,41000,0.92,110000,220,30,8500
import type { CalendarNight, ListingRecord, OtbSnapshot, Reservation } from '../types.ts';
import { mulberry32, hashSeed } from '../util/prng.ts';
import { addDays } from '../util/dates.ts';

export interface MonthlySnapshotRow {
  asOf: string;         // ISO date the OTB was recorded
  roomNights: number;   // on the books for this stay-month
  income: number;       // on the books for this stay-month
}

export interface SheetsMonth {
  month: string;              // YYYY-MM
  availableRoomNights: number;
  occTarget: number | null;   // 0..1
  revenueTarget: number | null;
  expectedAdr: number | null;
  stlyRoomNights: number | null; // same-time-last-year OTB (the pace baseline)
  stlyIncome: number | null;
  snapshots: MonthlySnapshotRow[]; // ascending by asOf
}

export interface SheetsProperty {
  name: string;
  rooms: number;
  months: SheetsMonth[];
}

const HEADER_SYNONYMS: Record<string, string[]> = {
  property: ['property', 'hotel', 'name', 'נכס', 'מלון'],
  rooms: ['rooms', 'roomcount', 'units', 'חדרים'],
  month: ['month', 'staymonth', 'monthof', 'חודש'],
  asof: ['asof', 'date', 'snapshotdate', 'week', 'תאריך'],
  roomnights: ['roomnights', 'rn', 'nights', 'roomnightsotb', 'לילות'],
  income: ['income', 'revenue', 'netroomincome', 'netincome', 'הכנסה'],
  occtarget: ['occtarget', 'targetocc', 'expectedocc', 'occupancytarget'],
  revenuetarget: ['revenuetarget', 'targetincome', 'incometarget', 'target'],
  expectedadr: ['expectedadr', 'adrtarget', 'targetadr'],
  stlyroomnights: ['stlyroomnights', 'stlyrn', 'lastyearroomnights', 'sametimern'],
  stlyincome: ['stlyincome', 'lastyearincome', 'sametimeincome'],
};

function canonHeader(h: string): string | null {
  const key = h.trim().toLowerCase().replace(/[^a-z֐-׿]/g, '');
  for (const [canon, names] of Object.entries(HEADER_SYNONYMS)) {
    if (names.includes(key)) return canon;
  }
  return null;
}

function toNumber(v: string): number | null {
  const n = Number(v.replace(/[,€$₪%\s]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function toMonth(v: string): string | null {
  const t = v.trim();
  let m = t.match(/^(\d{4})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}`;
  m = t.match(/^(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[2]}-${m[1].padStart(2, '0')}`;
  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  m = t.toLowerCase().match(/^([a-z]{3})[a-z]*[- ]?(\d{2,4})$/); // "Jun-26", "June 2026"
  if (m) {
    const idx = MONTHS.indexOf(m[1]);
    if (idx >= 0) {
      const year = m[2].length === 2 ? `20${m[2]}` : m[2];
      return `${year}-${String(idx + 1).padStart(2, '0')}`;
    }
  }
  return null;
}

function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Parse the canonical monthly-snapshot CSV. Throws with a line-numbered message on a
 *  malformed header; skips (and reports) unparseable rows rather than failing the import. */
export function parseMonthlySnapshotCsv(csv: string): { property: SheetsProperty; skipped: string[] } {
  const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) throw new Error('CSV needs a header row and at least one data row');

  const headers = lines[0].split(',').map(canonHeader);
  const idx = (name: string) => headers.indexOf(name);
  for (const required of ['month', 'asof', 'roomnights', 'income']) {
    if (idx(required) === -1) {
      throw new Error(`CSV header is missing a "${required}" column (got: ${lines[0]})`);
    }
  }

  const skipped: string[] = [];
  let name = 'Imported property';
  let rooms = 0;
  const byMonth = new Map<string, SheetsMonth>();

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',');
    const get = (col: string) => (idx(col) >= 0 ? (cells[idx(col)] ?? '').trim() : '');

    const month = toMonth(get('month'));
    const asOf = get('asof').match(/^\d{4}-\d{2}-\d{2}$/) ? get('asof') : null;
    const roomNights = toNumber(get('roomnights'));
    const income = toNumber(get('income'));
    if (!month || !asOf || roomNights === null || income === null) {
      skipped.push(`line ${i + 1}: ${lines[i].slice(0, 60)}`);
      continue;
    }
    if (get('property')) name = get('property');
    const r = toNumber(get('rooms'));
    if (r) rooms = r;

    let entry = byMonth.get(month);
    if (!entry) {
      entry = {
        month,
        availableRoomNights: 0, // filled below once rooms is known
        occTarget: null, revenueTarget: null, expectedAdr: null,
        stlyRoomNights: null, stlyIncome: null,
        snapshots: [],
      };
      byMonth.set(month, entry);
    }
    const occT = toNumber(get('occtarget'));
    if (occT !== null) entry.occTarget = occT > 1 ? occT / 100 : occT; // "92" or "0.92"
    entry.revenueTarget = toNumber(get('revenuetarget')) ?? entry.revenueTarget;
    entry.expectedAdr = toNumber(get('expectedadr')) ?? entry.expectedAdr;
    entry.stlyRoomNights = toNumber(get('stlyroomnights')) ?? entry.stlyRoomNights;
    entry.stlyIncome = toNumber(get('stlyincome')) ?? entry.stlyIncome;
    entry.snapshots.push({ asOf, roomNights, income });
  }

  if (byMonth.size === 0) throw new Error(`no usable rows (skipped ${skipped.length})`);
  if (rooms <= 0) rooms = 10; // sane default; occupancy targets still anchor the math
  const months = [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
  for (const m of months) {
    m.availableRoomNights = rooms * daysInMonth(m.month);
    m.snapshots.sort((a, b) => a.asOf.localeCompare(b.asOf));
  }
  return { property: { name, rooms, months }, skipped };
}

export interface MaterializedProperty {
  listing: ListingRecord;
  calendar: CalendarNight[];
  snapshots: OtbSnapshot[];
  reservations: Reservation[];
  stlyOccupancy: number;
  monthsLoaded: string[];
}

/** Turn parsed sheet data into the engine's world-shape. The nightly calendar is a
 *  STATISTICAL RENDERING of the monthly occupancy (a hotel's room-nights spread across the
 *  month deterministically) — window occupancy, pace and pickup are faithful to the sheet;
 *  individual nights are illustrative. Recommendations for sheets clients therefore run at
 *  guided tier: RevPilot proposes, the operator executes in the extranet. */
export function materializeProperty(
  clientId: string,
  property: SheetsProperty,
  simDate: string,
): MaterializedProperty {
  const rng = mulberry32(hashSeed(1, clientId, property.name));
  const id = `${clientId.toUpperCase().replace(/[^A-Z0-9]/g, '')}-${property.name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) || 'PROP'}`;

  // forward months only (a month is "forward" if it ends after simDate)
  const forward = property.months.filter((m) => `${m.month}-28` >= simDate);
  const latestOcc = (m: SheetsMonth) =>
    m.snapshots.length ? m.snapshots[m.snapshots.length - 1].roomNights / m.availableRoomNights : 0;

  // ---- nightly calendar: per-room nights so hotel occupancy renders faithfully ----
  const calendar: CalendarNight[] = [];
  for (const m of forward) {
    const days = daysInMonth(m.month);
    const occ = Math.min(1, latestOcc(m));
    const last = m.snapshots[m.snapshots.length - 1];
    const adr = last && last.roomNights > 0 ? last.income / last.roomNights : (m.expectedAdr ?? 100);
    for (let d = 1; d <= days; d++) {
      const stayDate = `${m.month}-${String(d).padStart(2, '0')}`;
      if (stayDate <= simDate) continue;
      for (let room = 0; room < property.rooms; room++) {
        calendar.push({
          stayDate: room === 0 ? stayDate : stayDate, // one row per room-night
          available: true,
          booked: rng() < occ,
          price: Math.round(adr),
          minStay: 1,
        });
      }
    }
  }

  // ---- OTB snapshot series over the forward window (drives pickup + the pace curve) ----
  // Sum each as-of's room nights across forward months; scale to the engine's forward-30 frame.
  const asOfDates = [...new Set(forward.flatMap((m) => m.snapshots.map((s) => s.asOf)))].sort();
  const snapshots: OtbSnapshot[] = asOfDates.map((asOf) => {
    let booked = 0;
    let income = 0;
    let avail = 0;
    for (const m of forward) {
      const upTo = [...m.snapshots].reverse().find((s) => s.asOf <= asOf);
      if (upTo) {
        booked += upTo.roomNights;
        income += upTo.income;
      }
      avail += m.availableRoomNights;
    }
    return { asOf, bookedNights: booked, availableNights: avail, otbRevenue: Math.round(income), soldOut: false };
  });

  // ---- targets + STLY, weighted by overlap with the 21-day recommendation window ----
  // The signal math compares WINDOW occupancy against these scalars, so they must describe
  // the same nights: July pace compares to July's own STLY, not an average that mixes in
  // September. Months outside the window fall back to proximity weights (nearest dominates).
  const windowNightsByMonth = new Map<string, number>();
  for (let k = 1; k <= 21; k++) {
    const month = addDays(simDate, k).slice(0, 7);
    windowNightsByMonth.set(month, (windowNightsByMonth.get(month) ?? 0) + 1);
  }
  const windowWeights = forward.map((m) => windowNightsByMonth.get(m.month) ?? 0);
  const proximityWeights = forward.map((_, i) => 1 / (i + 1));
  const weighted = (f: (m: SheetsMonth) => number | null, fallback: number) => {
    for (const weights of [windowWeights, proximityWeights]) {
      let acc = 0;
      let used = 0;
      forward.forEach((m, i) => {
        const v = f(m);
        if (v !== null && weights[i] > 0) {
          acc += v * weights[i];
          used += weights[i];
        }
      });
      if (used > 0) return acc / used;
    }
    return fallback;
  };
  const targetOccupancy = weighted((m) => m.occTarget, 0.7);
  const stlyOccupancy = weighted(
    (m) => (m.stlyRoomNights !== null ? m.stlyRoomNights / m.availableRoomNights : null),
    0,
  );
  const expectedAdr = weighted((m) => m.expectedAdr, 120);

  const listing: ListingRecord = {
    id,
    cmId: `sheets-${id.toLowerCase()}`,
    name: property.name,
    market: 'From sheet import',
    bedrooms: Math.min(9, property.rooms),
    baseRate: Math.round(expectedAdr),
    targetOccupancy: Math.round(targetOccupancy * 100) / 100,
    channels: ['booking', 'airbnb', 'expedia'],
    createdAt: simDate,
    imageHue: Math.floor(rng() * 360),
    clientId,
  };

  return {
    listing,
    calendar,
    snapshots,
    reservations: [], // lead-time detail isn't in monthly sheets; medianLeadTime reads 0
    stlyOccupancy: Math.round(stlyOccupancy * 10000) / 10000,
    monthsLoaded: forward.map((m) => m.month),
  };
}
