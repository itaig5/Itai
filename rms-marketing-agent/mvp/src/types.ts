// Domain types for the RMS + Marketing Assistant MVP.
// Kept to interfaces + string-literal unions so Node's type-stripping runs them directly.

export type Channel = 'airbnb' | 'booking' | 'expedia' | 'vrbo' | 'direct';
export type ExecTier = 'api' | 'guided' | 'recommend';

export interface Reservation {
  id: string;
  listingId: string;
  checkIn: string;   // ISO date (YYYY-MM-DD)
  checkOut: string;  // ISO date
  bookedAt: string;  // ISO datetime — the "as-of" for pace/lead-time
  nights: number;
  revenue: number;      // total incl. fees
  roomRevenue: number;  // nightly-rate portion only
  channel: Channel;
  status: 'confirmed' | 'canceled';
}

// One future stay-date's state (the unit the RMS reasons over).
export interface CalendarNight {
  stayDate: string;   // ISO date
  available: boolean; // bookable (NOT an owner/maintenance block)
  booked: boolean;
  price: number;
  minStay: number;
}

// Daily on-the-books snapshot for a window — the pace-curve history.
// Capture one of these PER DAY from day 1; you cannot reconstruct it later.
export interface OtbSnapshot {
  asOf: string;           // ISO date the snapshot was taken
  bookedNights: number;
  availableNights: number;
  otbRevenue: number;
  soldOut: boolean;       // needed later for unconstrained-demand estimation
}

export interface Signals {
  listingId: string;
  window: { start: string; end: string };
  occupancy: number;           // 0..1 on-the-books
  targetOccupancy: number;     // 0..1
  occupancyDeviation: number;  // occupancy - target
  paceVsStlyPct: number;       // occupancy now - occupancy STLY (percentage points, -0.20 = 20pp behind)
  pickup7d: number;            // net new booked nights over the last ~7 days
  adr: number;
  revpan: number;
  compGapPct: number;          // (myRate - compMedian)/compMedian ; +0.15 = 15% above market
  leadTimeDays: number;        // median days-to-arrival
  dataFreshnessTs: string;
  missing: string[];           // inputs that were absent/stale — the model must see these
}

export type SignalName =
  | 'soft_demand_overpriced'
  | 'soft_demand'
  | 'ahead_of_pace'
  | 'orphan_gap'
  | 'new_listing'
  | 'healthy';

export interface Finding {
  listingId: string;
  window: { start: string; end: string };
  signal: SignalName;
  metrics: Record<string, number>;
  confidence: number;  // 0..1
  rationale: string;   // grounded ONLY in the metrics above
}

export type MoveType =
  | 'last_minute'
  | 'weekly_los'
  | 'basic_deal'
  | 'early_booker'
  | 'remove_discounts'
  | 'new_listing'
  | 'none';

export interface PromoMove {
  type: MoveType;
  channel: Channel;
  depthPct: number;   // 0..1
  tier: ExecTier;     // api | guided | recommend
  rationale: string;
}

export interface Recommendation {
  recommendationId: string;      // short-lived staging token
  listingId: string;
  window: { start: string; end: string };
  move: PromoMove;
  finding: Finding;
  confidence: number;
  requiresHumanApproval: boolean; // ALWAYS true for execution (advisory-only design)
  risk: string;
  createdAt: string;
}
