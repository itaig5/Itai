// The deterministic demo world (BUILD_PROMPT step 7): 8 listings with distinct revenue stories —
// pacing behind/ahead, an operator-stacked discount that trips the guard, one visibility drop,
// orphan gaps, a new listing — plus history (reservations, snapshots, outcomes) so every screen
// has something real to show. Same seed -> byte-identical world.
import type {
  BanditContext, CalendarNight, Channel, ListingRecord, OtbSnapshot,
  OutcomeRecord, PromotionRecord, Recommendation, Reservation, VisibilityObservation,
} from '../types.ts';
import { DEFAULT_SETTINGS, type RevPilotState } from '../store/store.ts';
import { mulberry32, hashSeed, type Rng } from '../util/prng.ts';
import { addDays, eachDay, isWeekend } from '../util/dates.ts';
import { computeReward } from '../learning/rewards.ts';
import { contextBucket, armId } from '../learning/arms.ts';

export const DEFAULT_SEED = 42;
export const DEFAULT_SIM_DATE = '2026-07-02';
export const FORWARD_DAYS = 120;

interface Persona {
  id: string;
  name: string;
  market: string;
  bedrooms: number;
  baseRate: number;
  targetOccupancy: number;
  channels: Channel[];
  occ21: number;      // occupancy over the next 21 nights (the rec window)
  stlyOcc: number;    // same-time-last-year occupancy for that window
  compGap: number;    // my rate vs market median (+ = pricier)
  createdDaysAgo: number;
  channelFlags?: ListingRecord['channelFlags'];
  visibilityDrop?: boolean; // the one engineered rank/impressions drop (Ski Chalet)
  forceOrphanGaps?: boolean;
  pastOcc: number;    // trailing-180d occupancy for history/reservations
}

const ALL_OTA: Channel[] = ['airbnb', 'booking', 'expedia', 'vrbo'];

const PERSONAS: Persona[] = [
  { id: 'L-MARINA', name: 'Marina Loft', market: 'Tel Aviv', bedrooms: 2, baseRate: 210, targetOccupancy: 0.75,
    channels: ALL_OTA, occ21: 0.38, stlyOcc: 0.62, compGap: 0.18, createdDaysAgo: 700,
    channelFlags: { booking: { geniusTier: 1 } }, pastOcc: 0.68 },
  { id: 'L-CASITA', name: 'Old Town Casita', market: 'Lisbon', bedrooms: 1, baseRate: 145, targetOccupancy: 0.7,
    channels: ALL_OTA, occ21: 0.52, stlyOcc: 0.64, compGap: 0.03, createdDaysAgo: 540, pastOcc: 0.66 },
  { id: 'L-CEDAR', name: 'Cedar Cabin A', market: 'Asheville', bedrooms: 3, baseRate: 180, targetOccupancy: 0.65,
    channels: ['airbnb', 'vrbo', 'booking'], occ21: 0.58, stlyOcc: 0.65, compGap: -0.02, createdDaysAgo: 900,
    forceOrphanGaps: true, pastOcc: 0.61 },
  { id: 'L-HARBOR', name: 'Harbor View Suite', market: 'Split', bedrooms: 2, baseRate: 230, targetOccupancy: 0.7,
    channels: ALL_OTA, occ21: 0.82, stlyOcc: 0.7, compGap: 0.05, createdDaysAgo: 800,
    channelFlags: { booking: { geniusTier: 1 } }, pastOcc: 0.72 },
  { id: 'L-GARDEN', name: 'Garden Studio', market: 'Athens', bedrooms: 0, baseRate: 95, targetOccupancy: 0.6,
    channels: ['airbnb', 'booking'], occ21: 0.63, stlyOcc: 0.62, compGap: 0, createdDaysAgo: 420, pastOcc: 0.6 },
  { id: 'L-SUNSET', name: 'Sunset Villa', market: 'Algarve', bedrooms: 4, baseRate: 320, targetOccupancy: 0.6,
    channels: ALL_OTA, occ21: 0.45, stlyOcc: 0.58, compGap: 0.06, createdDaysAgo: 650,
    channelFlags: { booking: { geniusTier: 1, mobileRate: true } }, pastOcc: 0.55 },
  { id: 'L-CHALET', name: 'Ski Chalet Nord', market: 'Bansko', bedrooms: 3, baseRate: 160, targetOccupancy: 0.55,
    channels: ['booking', 'airbnb', 'expedia'], occ21: 0.54, stlyOcc: 0.55, compGap: 0.02, createdDaysAgo: 480,
    visibilityDrop: true, pastOcc: 0.58 },
  { id: 'L-CITYNEST', name: 'City Nest 2BR', market: 'Kraków', bedrooms: 2, baseRate: 120, targetOccupancy: 0.65,
    channels: ['airbnb', 'booking'], occ21: 0.35, stlyOcc: 0.42, compGap: -0.05, createdDaysAgo: 18, pastOcc: 0.3 },
];

export interface WorldOptions {
  seed?: number;
  simDate?: string;
}

export function generateWorld(opts: WorldOptions = {}): RevPilotState {
  const seed = opts.seed ?? DEFAULT_SEED;
  const simDate = opts.simDate ?? DEFAULT_SIM_DATE;
  const counters: Record<string, number> = {};
  const nextId = (prefix: string) => {
    counters[prefix] = (counters[prefix] ?? 0) + 1;
    return `${prefix}_${String(counters[prefix]).padStart(5, '0')}`;
  };

  const listings: ListingRecord[] = [];
  const calendar: Record<string, CalendarNight[]> = {};
  const reservations: Reservation[] = [];
  const snapshots: Record<string, OtbSnapshot[]> = {};
  const stlyOccupancy: Record<string, number> = {};
  const compMedianRate: Record<string, number> = {};
  const visibilityObservations: VisibilityObservation[] = [];

  for (const p of PERSONAS) {
    const rng = mulberry32(hashSeed(seed, p.id));
    listings.push({
      id: p.id, cmId: `guesty-${p.id.toLowerCase()}`, name: p.name, market: p.market,
      bedrooms: p.bedrooms, baseRate: p.baseRate, targetOccupancy: p.targetOccupancy,
      channels: p.channels, createdAt: addDays(simDate, -p.createdDaysAgo),
      imageHue: Math.floor(rng() * 360), channelFlags: p.channelFlags,
    });

    calendar[p.id] = generateForwardCalendar(p, simDate, rng);
    reservations.push(...reservationsFromCalendar(p, calendar[p.id], simDate, rng, nextId));
    reservations.push(...pastReservations(p, simDate, rng, nextId));
    snapshots[p.id] = generateSnapshots(p, calendar[p.id], simDate, rng);
    stlyOccupancy[p.id] = p.stlyOcc;
    compMedianRate[p.id] = Math.round(p.baseRate / (1 + p.compGap));
    visibilityObservations.push(...generateVisibility(p, simDate, rng));
  }

  // the seed portfolio belongs to one already-connected demo client account
  const seedClientId = nextId('cl');
  const clients: RevPilotState['clients'] = [{
    id: seedClientId,
    name: 'Sunrise Stays (demo)',
    contactEmail: 'ops@sunrisestays.example',
    market: 'Mixed EU/US',
    channelManager: 'demo',
    status: 'connected',
    statusDetail: `${PERSONAS.length} listings imported from the demo portfolio`,
    listingIds: PERSONAS.map((p) => p.id),
    createdAt: addDays(simDate, -30),
    connectedAt: addDays(simDate, -30),
  }];
  for (const l of listings) l.clientId = seedClientId;

  // --- history: a promo that already ran + one still active, so outcomes/audit aren't empty ---
  const promotions: PromotionRecord[] = [];
  const recommendations: Recommendation[] = [];
  const outcomes: OutcomeRecord[] = [];
  const audit: RevPilotState['audit'] = [];
  const banditState: RevPilotState['banditState'] = {};
  const log = (ts: string, actor: 'system' | 'operator' | 'workflow', kind: RevPilotState['audit'][number]['kind'], detail: string, extra: Partial<RevPilotState['audit'][number]> = {}) =>
    audit.push({ id: nextId('evt'), ts, actor, kind, detail, ...extra });

  // 1) CASITA: a measured, finished promo from 3 weeks ago (the learning loop's first label)
  const casitaRecId = nextId('rec');
  const casitaCtx: BanditContext = { occupancyDeviation: -0.2, paceVsStlyPct: -0.13, compGapPct: 0.04, leadTimeDays: 18, pickup7d: 2, visibilityDrop: 0 };
  const casitaArm = { type: 'last_minute' as const, depthPct: 0.15 };
  recommendations.push(historicalRec(casitaRecId, 'L-CASITA', addDays(simDate, -23), casitaArm.depthPct, 'soft_demand',
    'Occupancy 50% vs target 70%, pacing 13pp behind STLY.', ['booking', 'airbnb', 'expedia', 'vrbo'], 'executed'));
  const casitaPromoId = nextId('promo');
  promotions.push({
    id: casitaPromoId, listingId: 'L-CASITA', channel: 'booking', type: 'last_minute', depthPct: 0.15,
    window: { start: addDays(simDate, -22), end: addDays(simDate, -8) }, status: 'ended', source: 'revpilot',
    createdAt: addDays(simDate, -22), recommendationId: casitaRecId, endedAt: addDays(simDate, -8), endedReason: 'expired',
  });
  const casitaReward = computeReward({ bookingLift: 0.12, revenueLift: 9, visibilityChange: null, baselineRevpan: 84 });
  outcomes.push({
    id: nextId('out'), recommendationId: casitaRecId, listingId: 'L-CASITA',
    channels: ['booking', 'airbnb', 'expedia', 'vrbo'], actionType: 'last_minute', depthPct: 0.15,
    context: casitaCtx, executedAt: addDays(simDate, -22), measureAfterDays: 7, measuredAt: addDays(simDate, -15),
    baseline: { occupancy: 0.5, pickupPerDay: 0.3, revpan: 84, rank: 9 },
    result: { occupancy: 0.61, pickupPerDay: 0.42, revpan: 93, rank: 9 },
    bookingLift: 0.12, revenueLift: 9, visibilityChange: 0, reward: casitaReward, status: 'measured',
  });
  bumpBandit(banditState, casitaCtx, casitaArm, casitaReward);

  // 2) HARBOR: promo pushed 9 days ago, measured 2 days ago, STILL ACTIVE — pace has recovered,
  //    so the auto-turn-off will end it on the next day advance (visible behavior).
  const harborRecId = nextId('rec');
  const harborCtx: BanditContext = { occupancyDeviation: -0.09, paceVsStlyPct: -0.08, compGapPct: 0.05, leadTimeDays: 21, pickup7d: 3, visibilityDrop: 0 };
  const harborArm = { type: 'last_minute' as const, depthPct: 0.1 };
  recommendations.push(historicalRec(harborRecId, 'L-HARBOR', addDays(simDate, -10), harborArm.depthPct, 'soft_demand',
    'Occupancy 61% vs target 70%, pacing 8pp behind STLY.', ['booking', 'airbnb'], 'executed'));
  for (const ch of ['booking', 'airbnb'] as const) {
    promotions.push({
      id: nextId('promo'), listingId: 'L-HARBOR', channel: ch, type: 'last_minute', depthPct: 0.1,
      window: { start: addDays(simDate, -9), end: addDays(simDate, 12) }, status: 'active', source: 'revpilot',
      createdAt: addDays(simDate, -9), recommendationId: harborRecId,
    });
  }
  const harborReward = computeReward({ bookingLift: 0.43, revenueLift: 28, visibilityChange: 1, baselineRevpan: 128 });
  outcomes.push({
    id: nextId('out'), recommendationId: harborRecId, listingId: 'L-HARBOR',
    channels: ['booking', 'airbnb'], actionType: 'last_minute', depthPct: 0.1,
    context: harborCtx, executedAt: addDays(simDate, -9), measureAfterDays: 7, measuredAt: addDays(simDate, -2),
    baseline: { occupancy: 0.61, pickupPerDay: 0.43, revpan: 128, rank: 7 },
    result: { occupancy: 0.79, pickupPerDay: 0.86, revpan: 156, rank: 6 },
    bookingLift: 0.43, revenueLift: 28, visibilityChange: 1, reward: harborReward, status: 'measured',
  });
  bumpBandit(banditState, harborCtx, harborArm, harborReward);

  // 3) SUNSET: the operator added a 20% deal on Booking.com THEMSELVES 12 days ago — the
  //    stacked-discount hazard (Genius + mobile + deal) the guardrail exists for.
  promotions.push({
    id: nextId('promo'), listingId: 'L-SUNSET', channel: 'booking', type: 'basic_deal', depthPct: 0.2,
    window: { start: addDays(simDate, -12), end: addDays(simDate, 30) }, status: 'active', source: 'operator',
    createdAt: addDays(simDate, -12),
  });

  // --- audit history (append-only; the Audit screen's opening story) ---
  log(addDays(simDate, -23), 'workflow', 'recommendation_created', 'soft_demand: last_minute 15% -> booking, airbnb, expedia, vrbo', { listingId: 'L-CASITA', recommendationId: casitaRecId });
  log(addDays(simDate, -22), 'operator', 'approved', 'Operator approved last_minute 15% -> pushing to booking, airbnb, expedia, vrbo', { listingId: 'L-CASITA', recommendationId: casitaRecId });
  log(addDays(simDate, -22), 'operator', 'executed', 'Pushed last_minute at 15% to booking (ref guesty-sim-1041)', { listingId: 'L-CASITA', recommendationId: casitaRecId, channel: 'booking' });
  log(addDays(simDate, -15), 'system', 'outcome_measured', `Measured CASITA last-minute 15%: +0.12 nights/day, +€9 RevPAN -> reward ${casitaReward}`, { listingId: 'L-CASITA', recommendationId: casitaRecId });
  log(addDays(simDate, -15), 'system', 'bandit_update', `Bandit updated ${armId(casitaArm)} in ${contextBucket(casitaCtx)} with reward ${casitaReward}`, { listingId: 'L-CASITA' });
  log(addDays(simDate, -12), 'operator', 'settings_changed', 'Operator created a 20% Basic Deal on Booking.com directly in the extranet (Sunset Villa) — imported on sync', { listingId: 'L-SUNSET', channel: 'booking' });
  log(addDays(simDate, -10), 'workflow', 'recommendation_created', 'soft_demand: last_minute 10% -> booking, airbnb', { listingId: 'L-HARBOR', recommendationId: harborRecId });
  log(addDays(simDate, -9), 'operator', 'approved', 'Operator approved last_minute 10% -> pushing to booking, airbnb', { listingId: 'L-HARBOR', recommendationId: harborRecId });
  log(addDays(simDate, -9), 'operator', 'executed', 'Pushed last_minute at 10% to booking (ref guesty-sim-1057)', { listingId: 'L-HARBOR', recommendationId: harborRecId, channel: 'booking' });
  log(addDays(simDate, -9), 'operator', 'executed', 'Pushed last_minute at 10% to airbnb (ref guesty-sim-1058)', { listingId: 'L-HARBOR', recommendationId: harborRecId, channel: 'airbnb' });
  log(addDays(simDate, -2), 'system', 'outcome_measured', `Measured HARBOR last-minute 10%: +0.43 nights/day, +€28 RevPAN, rank +1 -> reward ${harborReward}`, { listingId: 'L-HARBOR', recommendationId: harborRecId });
  log(addDays(simDate, -2), 'system', 'bandit_update', `Bandit updated ${armId(harborArm)} in ${contextBucket(harborCtx)} with reward ${harborReward}`, { listingId: 'L-HARBOR' });
  log(addDays(simDate, -3), 'system', 'visibility_drop', 'Ski Chalet Nord dropped from rank 6 to 19 on booking; impressions down 41% — recommendation queued', { listingId: 'L-CHALET', channel: 'booking' });
  log(simDate, 'system', 'snapshot', 'Daily OTB snapshot captured for 8 listings (pace curves updated)', {});

  return {
    seed, simDate, clients, users: [], listings, calendar, reservations, snapshots, stlyOccupancy, compMedianRate,
    visibilityObservations, promotions, recommendations, outcomes, audit,
    settings: structuredClone(DEFAULT_SETTINGS), banditState, banditModel: 'ts-thompson-v1', counters,
  };
}

// ---------------------------------------------------------------------------
// Client portfolio generation — powers "connect a demo client" on the Clients
// screen: N fresh listings with full history that flow straight into the brain.
// ---------------------------------------------------------------------------

const UNIT_NAMES = [
  'Harbor Flat', 'Old Mill Loft', 'Stone Court 3BR', 'Palm Garden Studio',
  'Lakeview Cabin', 'Bell Tower Suite', 'Cypress Villa', 'Canal House',
  'Meadow Barn', 'Pier 9 Apartment', 'Vineyard Cottage', 'Summit Chalet',
];

export interface ClientPortfolio {
  listings: ListingRecord[];
  calendar: Record<string, CalendarNight[]>;
  reservations: Reservation[];
  snapshots: Record<string, OtbSnapshot[]>;
  stlyOccupancy: Record<string, number>;
  compMedianRate: Record<string, number>;
  visibilityObservations: VisibilityObservation[];
}

/** Deterministic per-client portfolio: a mix of behind-pace, ahead, and healthy units so a
 *  freshly connected client immediately exercises the whole recommendation loop. */
export function generateClientListings(
  seed: number,
  client: { id: string; name: string; market: string },
  count: number,
  simDate: string,
): ClientPortfolio {
  const out: ClientPortfolio = {
    listings: [], calendar: {}, reservations: [], snapshots: {},
    stlyOccupancy: {}, compMedianRate: {}, visibilityObservations: [],
  };
  const n = Math.max(1, Math.min(count, UNIT_NAMES.length));
  for (let i = 0; i < n; i++) {
    const rng = mulberry32(hashSeed(seed, client.id, i));
    const occ21 = 0.35 + rng() * 0.5;                          // 35%..85% booked
    const paceDelta = (rng() - 0.55) * 0.3;                    // slight bias toward behind
    const persona: Persona = {
      id: `${client.id.toUpperCase().replace(/[^A-Z0-9]/g, '')}-U${i + 1}`,
      name: `${UNIT_NAMES[i]} — ${client.name.split(' ')[0]}`,
      market: client.market,
      bedrooms: Math.floor(rng() * 4),
      baseRate: Math.round(90 + rng() * 190),
      targetOccupancy: Math.round((0.6 + rng() * 0.15) * 100) / 100,
      channels: ALL_OTA,
      occ21: Math.round(occ21 * 100) / 100,
      stlyOcc: Math.max(0.2, Math.min(0.9, Math.round((occ21 - paceDelta) * 100) / 100)),
      compGap: Math.round((rng() - 0.4) * 0.3 * 100) / 100,    // -12%..+18% vs market
      createdDaysAgo: 200 + Math.floor(rng() * 500),
      pastOcc: Math.max(0.25, occ21 - 0.05),
    };
    // ids must never collide with existing reservation counters — prefix with the client id
    let resSeq = 0;
    const clientNextId = (prefix: string) => `${prefix}_${client.id}_${String(++resSeq).padStart(4, '0')}`;

    out.listings.push({
      id: persona.id, cmId: `${client.id}-${persona.id.toLowerCase()}`, name: persona.name,
      market: persona.market, bedrooms: persona.bedrooms, baseRate: persona.baseRate,
      targetOccupancy: persona.targetOccupancy, channels: persona.channels,
      createdAt: addDays(simDate, -persona.createdDaysAgo),
      imageHue: Math.floor(rng() * 360), clientId: client.id,
    });
    out.calendar[persona.id] = generateForwardCalendar(persona, simDate, rng);
    out.reservations.push(...reservationsFromCalendar(persona, out.calendar[persona.id], simDate, rng, clientNextId));
    out.reservations.push(...pastReservations(persona, simDate, rng, clientNextId));
    out.snapshots[persona.id] = generateSnapshots(persona, out.calendar[persona.id], simDate, rng);
    out.stlyOccupancy[persona.id] = persona.stlyOcc;
    out.compMedianRate[persona.id] = Math.round(persona.baseRate / (1 + persona.compGap));
    out.visibilityObservations.push(...generateVisibility(persona, simDate, rng));
  }
  return out;
}

// ---------- generation helpers ----------

function generateForwardCalendar(p: Persona, simDate: string, rng: Rng): CalendarNight[] {
  const nights: CalendarNight[] = eachDay(addDays(simDate, 1), FORWARD_DAYS).map((stayDate, i) => {
    const wknd = isWeekend(stayDate);
    const leadDecay = Math.max(0.15, Math.min(1, 1.3 - i / 60)); // farther out -> less booked
    const pBooked = p.occ21 * leadDecay * (wknd ? 1.25 : 0.95);
    return {
      stayDate,
      available: true,
      booked: rng() < pBooked,
      price: Math.round(p.baseRate * (wknd ? 1.18 : 1) * (i > 60 ? 1.05 : 1)),
      minStay: p.bedrooms >= 3 ? 2 : 1,
    };
  });

  // The 21-night rec window is ENGINEERED, not sampled: exact occupancy, and gaps >= 3 nights
  // so orphan gaps appear only where the story plants them (Cedar Cabin).
  const layout = p.forceOrphanGaps
    // 12/21 booked with three orphan holes (1, 2, and 1 nights) flanked by bookings
    ? [1, 1, 1, 1, 0, 1, 1, 0, 0, 1, 1, 1, 0, 1, 1, 1, 0, 0, 0, 0, 0]
    : layoutWindow(Math.round(p.occ21 * 21), 21);
  layout.forEach((b, i) => { nights[i].booked = b === 1; });
  return nights;
}

/** Pack `booked` nights into runs separated by gaps of >=3 (a <=2-night hole flanked by
 *  bookings would read as an orphan gap). Leftover free nights extend the first gap. */
function layoutWindow(booked: number, len: number): number[] {
  const free = len - booked;
  const out = new Array<number>(len).fill(0);
  if (booked <= 0) return out;
  if (free < 3) {
    // too full for interior gaps — one contiguous block, trailing free nights at the end
    for (let i = 0; i < booked; i++) out[i] = 1;
    return out;
  }
  const gaps = Math.max(1, Math.min(Math.floor(free / 3), booked - 1));
  const runs = gaps + 1;
  const runSizes = Array.from({ length: runs }, (_, i) =>
    Math.floor(booked / runs) + (i < booked % runs ? 1 : 0));
  const gapSizes = Array.from({ length: gaps }, (_, i) =>
    3 + (i === 0 ? free - 3 * gaps : 0));
  let idx = 0;
  for (let r = 0; r < runs; r++) {
    for (let i = 0; i < runSizes[r] && idx < len; i++) out[idx++] = 1;
    if (r < gaps) idx += gapSizes[r];
  }
  return out;
}

function reservationsFromCalendar(p: Persona, cal: CalendarNight[], simDate: string, rng: Rng, nextId: (p: string) => string): Reservation[] {
  const out: Reservation[] = [];
  let i = 0;
  while (i < cal.length) {
    if (!cal[i].booked) { i++; continue; }
    let j = i;
    while (j < cal.length && cal[j].booked && j - i < 5) j++;
    const nights = cal.slice(i, j);
    const roomRevenue = nights.reduce((s, n) => s + n.price, 0);
    const lead = Math.max(1, Math.round(3 + rng() * 42));
    out.push({
      id: nextId('res'), listingId: p.id,
      checkIn: nights[0].stayDate, checkOut: addDays(nights[nights.length - 1].stayDate, 1),
      bookedAt: `${addDays(nights[0].stayDate, -lead)}T${String(Math.floor(rng() * 24)).padStart(2, '0')}:00:00Z`,
      nights: nights.length, revenue: Math.round(roomRevenue * 1.12), roomRevenue,
      channel: pickChannel(p.channels, rng), status: 'confirmed',
    });
    i = j;
  }
  return out;
}

function pastReservations(p: Persona, simDate: string, rng: Rng, nextId: (p: string) => string): Reservation[] {
  const out: Reservation[] = [];
  const start = addDays(simDate, -180);
  let cursor = 0;
  const days = Math.min(180, p.createdDaysAgo);
  const offset = 180 - days;
  while (cursor < days) {
    if (rng() < p.pastOcc) {
      const stay = 1 + Math.floor(rng() * 4);
      const checkIn = addDays(start, offset + cursor);
      const roomRevenue = Math.round(p.baseRate * stay * (0.92 + rng() * 0.2));
      const lead = Math.max(1, Math.round(2 + rng() * 38));
      out.push({
        id: nextId('res'), listingId: p.id, checkIn, checkOut: addDays(checkIn, stay),
        bookedAt: `${addDays(checkIn, -lead)}T${String(Math.floor(rng() * 24)).padStart(2, '0')}:00:00Z`,
        nights: stay, revenue: Math.round(roomRevenue * 1.12), roomRevenue,
        channel: pickChannel(p.channels, rng), status: rng() < 0.06 ? 'canceled' : 'confirmed',
      });
      cursor += stay + Math.floor(rng() * 2);
    } else {
      cursor += 1;
    }
  }
  return out;
}

function generateSnapshots(p: Persona, cal: CalendarNight[], simDate: string, rng: Rng): OtbSnapshot[] {
  // Daily OTB for the forward-30 window over the last 30 days. Behind-pace listings pick up
  // slowly (flat curve); ahead-of-pace ones accelerate — that's what pickup7d/pace read.
  const window = cal.slice(0, 30);
  const availableNights = window.length;
  const nowBooked = window.filter((n) => n.booked).length;
  const adr = p.baseRate;
  const behind = p.occ21 < p.stlyOcc;
  const startFrac = behind ? 0.8 : 0.45; // behind = most bookings are old; ahead = recent surge
  const snaps: OtbSnapshot[] = [];
  for (let d = 30; d >= 0; d--) {
    const progress = (30 - d) / 30;
    const curve = behind ? Math.pow(progress, 0.55) : Math.pow(progress, 1.9);
    const booked = Math.min(availableNights, Math.round(nowBooked * (startFrac + (1 - startFrac) * curve) + (rng() - 0.5)));
    snaps.push({
      asOf: addDays(simDate, -d),
      bookedNights: Math.max(0, d === 0 ? nowBooked : booked),
      availableNights,
      otbRevenue: Math.max(0, (d === 0 ? nowBooked : booked)) * adr,
      soldOut: false,
    });
  }
  return snaps;
}

function generateVisibility(p: Persona, simDate: string, rng: Rng): VisibilityObservation[] {
  const out: VisibilityObservation[] = [];
  const platforms = p.channels.filter((c): c is Exclude<Channel, 'direct'> => c !== 'direct');
  for (const platform of platforms) {
    const isDropping = p.visibilityDrop && platform === 'booking';
    const baseRank = 4 + Math.floor(rng() * 10);
    // weekly public-rank proxy points over the last 8 weeks
    for (let w = 8; w >= 0; w--) {
      const observedAt = addDays(simDate, -w * 7 + (w === 0 ? -3 : 0));
      let rank = Math.max(1, Math.round(baseRank + (rng() - 0.5) * 2));
      if (isDropping) rank = w >= 3 ? 6 : [19, 14, 9][w] ?? 19; // 6 -> 9 -> 14 -> 19 over 3 weeks
      out.push({ listingId: p.id, platform, observedAt, source: 'public_rank', rank });
    }
    // operator-entered funnel metrics (extranet is human-in-the-loop, doc 11), weekly
    const baseImpr = 1800 + Math.floor(rng() * 2400);
    for (let w = 4; w >= 0; w--) {
      const observedAt = addDays(simDate, -w * 7 - 1);
      let impressions = Math.round(baseImpr * (0.92 + rng() * 0.16));
      if (isDropping) impressions = [1900, 2200, 2600, 3000, 3200][w] ?? 1900;
      out.push({
        listingId: p.id, platform, observedAt, source: 'operator_input',
        searchImpressions: impressions,
        ctr: Math.round((0.032 + rng() * 0.02 - (isDropping && w < 2 ? 0.012 : 0)) * 1000) / 1000,
        conversion: Math.round((0.011 + rng() * 0.008) * 1000) / 1000,
      });
    }
    // review score (quality is a rank factor) + program status
    out.push({
      listingId: p.id, platform, observedAt: addDays(simDate, -2), source: 'reviews',
      reviewScore: isDropping ? 7.4 : Math.round((7.8 + rng() * 1.8) * 10) / 10,
      programs: p.channelFlags?.[platform]?.geniusTier
        ? [{ program: 'genius', enrolled: true }]
        : platform === 'booking' ? [{ program: 'genius', enrolled: false }] : [],
    });
  }
  return out;
}

function pickChannel(channels: Channel[], rng: Rng): Channel {
  const weights: Record<string, number> = { booking: 0.4, airbnb: 0.35, expedia: 0.15, vrbo: 0.1, direct: 0.05 };
  const avail = channels.filter((c) => c !== 'direct');
  const total = avail.reduce((s, c) => s + (weights[c] ?? 0.1), 0);
  let roll = rng() * total;
  for (const c of avail) {
    roll -= weights[c] ?? 0.1;
    if (roll <= 0) return c;
  }
  return avail[0];
}

function historicalRec(
  id: string, listingId: string, createdAt: string, depth: number, signal: 'soft_demand',
  rationale: string, targetChannels: Channel[], status: 'executed',
): Recommendation {
  const window = { start: addDays(createdAt, 1), end: addDays(createdAt, 15) };
  return {
    recommendationId: id, listingId, window,
    move: { type: 'last_minute', channel: 'booking', depthPct: depth, tier: 'api', rationale, window },
    finding: {
      listingId, window, signal,
      metrics: { occupancy: 0.5, target: 0.7, paceVsStlyPct: -0.13, compGapPct: 0.04, pickup7d: 2 },
      confidence: 0.65, rationale,
    },
    confidence: 0.65, requiresHumanApproval: true,
    risk: 'Discount depth affects margin — the guardrail simulates stacked discounts per channel before any write.',
    createdAt, targetChannels, guidedActions: [], status,
  };
}

function bumpBandit(
  state: RevPilotState['banditState'],
  ctx: BanditContext,
  arm: { type: 'last_minute'; depthPct: number },
  reward: number,
): void {
  const key = `${contextBucket(ctx)}|${armId(arm)}`;
  const cur = state[key] ?? { alpha: 1, beta: 1, pulls: 0 };
  state[key] = { alpha: cur.alpha + reward, beta: cur.beta + (1 - reward), pulls: cur.pulls + 1 };
}
