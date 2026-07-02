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
  visibility?: VisibilitySignals[];  // per-platform visibility signals (doc 11) — v2 addition
  orphanGapCount?: number;           // orphan gaps detected in the window — v2 addition
}

export type SignalName =
  | 'soft_demand_overpriced'
  | 'soft_demand'
  | 'ahead_of_pace'
  | 'orphan_gap'
  | 'new_listing'
  | 'visibility_drop'
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
  window?: { start: string; end: string }; // stay-date window the promo applies to — v2 addition
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
  // v2 additions (all optional so the tested v1 contract is unchanged):
  targetChannels?: Channel[];        // "approve once -> push to ALL of these"
  guidedActions?: GuidedAction[];    // program enrollment / content fixes (no API)
  banditChoice?: BanditChoice;       // which arm the learning policy picked, and why
  status?: RecommendationStatus;
}

export type RecommendationStatus =
  | 'proposed' | 'approved' | 'executed' | 'rejected' | 'blocked' | 'expired' | 'auto_executed';

// ---------------------------------------------------------------------------
// v2: visibility, learning, execution & audit domain (docs 11/12 + BUILD_PROMPT)
// ---------------------------------------------------------------------------

/** OTA platforms visibility/promotions apply to (everything except 'direct'). */
export type Platform = Exclude<Channel, 'direct'>;

export type VisibilitySource = 'market_insights' | 'public_rank' | 'operator_input' | 'reviews';

export interface ProgramStatus {
  program: string;    // 'genius' | 'preferred_partner' | 'superhost' | 'accelerator' | ...
  enrolled: boolean;
}

/** One raw observation from a VisibilityAdapter. Funnel fields are mostly operator-input (doc 11). */
export interface VisibilityObservation {
  listingId: string;
  platform: Platform;
  observedAt: string;           // ISO date
  source: VisibilitySource;
  rank?: number;                // public-search position proxy (1 = top)
  searchImpressions?: number;
  ctr?: number;                 // 0..1
  conversion?: number;          // 0..1
  reviewScore?: number;         // normalized 0..10
  programs?: ProgramStatus[];
}

/** Per-platform visibility signals the RMS brain consumes (a sibling of Signals). */
export interface VisibilitySignals {
  listingId: string;
  platform: Platform;
  rank: number | null;
  rankTrend14d: number | null;      // rankNow - rank14dAgo; POSITIVE = dropped (worse)
  impressions7d: number | null;
  impressionsTrendPct: number | null; // week-over-week % change, -0.3 = down 30%
  ctr: number | null;
  conversion: number | null;
  reviewScore: number | null;
  programs: ProgramStatus[];
  dropDetected: boolean;
  dropReason: string | null;
  dataFreshnessTs: string;
  sources: VisibilitySource[];
  missing: string[];
}

/** Guided (no-API) actions: program enrollment deep links, content/quality fixes. */
export interface GuidedAction {
  kind: 'program_enrollment' | 'content_fix';
  platform: Platform;
  title: string;
  url: string;        // deep link into the extranet
  steps: string[];    // operator checklist
}

// --- Learning loop (doc 12 §3): context -> arm -> outcome -> reward ---

/** Decision-time context. OWN-listing data + public comps only (RealPage/AB325 rule). */
export interface BanditContext {
  occupancyDeviation: number;
  paceVsStlyPct: number;
  compGapPct: number;
  leadTimeDays: number;
  pickup7d: number;
  visibilityDrop: 0 | 1;
}

export interface BanditArm {
  type: MoveType;
  depthPct: number;
}

export interface BanditChoice {
  arm: BanditArm;
  score: number;        // policy's expected reward for the chosen arm
  explore: boolean;     // true when the policy explored rather than exploited
  model: string;        // e.g. 'ts-thompson-v1' | 'ml-service:thompson-v1'
}

export interface OutcomeMetrics {
  occupancy: number;
  pickupPerDay: number;   // booked nights gained per elapsed day
  revpan: number;
  rank: number | null;    // best (min) rank across platforms, if tracked
}

/** Immutable outcome-log row — the labeled training data the moat is built on. */
export interface OutcomeRecord {
  id: string;
  recommendationId: string;
  listingId: string;
  channels: Channel[];
  actionType: MoveType;
  depthPct: number;
  context: BanditContext;
  executedAt: string;
  measureAfterDays: number;
  measuredAt: string | null;
  baseline: OutcomeMetrics;
  result: OutcomeMetrics | null;
  bookingLift: number | null;      // pickup/day delta vs baseline
  revenueLift: number | null;      // revpan delta vs baseline
  visibilityChange: number | null; // rank positions recovered (positive = improved)
  reward: number | null;           // normalized 0..1 for the bandit
  status: 'pending' | 'measured';
}

// --- Cross-channel promotion state (the Promotion Radar rows) ---

export type PromotionStatus = 'active' | 'scheduled' | 'ended' | 'pending_sync';

export interface PromotionRecord {
  id: string;
  listingId: string;
  channel: Channel;
  type: MoveType;
  depthPct: number;
  window: { start: string; end: string };
  status: PromotionStatus;
  source: 'revpilot' | 'operator' | 'ota';  // operator/ota promos = the stacking hazard we guard against
  createdAt: string;
  recommendationId?: string;
  endedAt?: string;
  endedReason?: 'pace_recovered' | 'operator' | 'expired' | 'guardrail';
}

// --- Operator settings: autonomy + guardrail caps + channel connections ---

export type AutonomyMode = 'approve_each' | 'auto_within_bounds';

export interface AutonomyBounds {
  maxDepthPct: number;                // never auto-run deeper than this
  maxActivePromosPerListing: number;
  allowedTypes: MoveType[];
  minPaceDeficitPct: number;          // only auto-run when deficit >= this (own-data trigger)
}

export interface ChannelConnection {
  connected: boolean;
  via: 'guesty' | 'hostaway' | 'mock';
}

export interface OperatorSettings {
  autonomyMode: AutonomyMode;         // default approve_each — NEVER auto-accept by default (RealPage)
  bounds: AutonomyBounds;
  maxEffectiveDiscount: number;       // guardrail cap (~0.35)
  clipFloorPctOfAdr: number;          // break-even floor as a fraction of ADR (e.g. 0.55)
  autoTurnOffEnabled: boolean;        // unassign promos once pace recovers
  measureAfterDays: number;           // outcome measurement horizon
  channels: Record<Platform, ChannelConnection>;
}

// --- Immutable audit trail (docs 08 part B: the schema IS the audit record) ---

export type AuditKind =
  | 'recommendation_created' | 'verifier_pass' | 'verifier_block'
  | 'approved' | 'rejected' | 'dry_run' | 'executed' | 'auto_executed'
  | 'guardrail_block' | 'guided_step' | 'promo_ended' | 'outcome_measured'
  | 'bandit_update' | 'visibility_drop' | 'settings_changed' | 'snapshot' | 'learning_job';

export interface AuditEvent {
  id: string;
  ts: string;                 // ISO datetime (sim clock)
  actor: 'system' | 'operator' | 'workflow';
  kind: AuditKind;
  listingId?: string;
  recommendationId?: string;
  channel?: Channel;
  detail: string;             // plain-English, grounded in the payload
  payload?: unknown;
}

// --- Listing metadata (extends the adapter-level Listing with RMS fields) ---

/** Channel-side pricing programs already active on a listing — the stacking inputs the
 *  double-discount guard simulates BEFORE any write (Booking multiplies, Airbnb stacks by priority). */
export interface ChannelFlags {
  geniusTier?: 0 | 1 | 2 | 3;
  mobileRate?: boolean;
  countryRate?: boolean;
  ruleSetDiscount?: number;        // Airbnb seasonal rule-set
  nonRefundableDiscount?: number;  // Airbnb ~10%
}

export interface ListingRecord {
  id: string;
  cmId: string;
  name: string;
  market: string;
  bedrooms: number;
  baseRate: number;           // nightly base rate
  targetOccupancy: number;    // 0..1
  channels: Channel[];
  createdAt: string;          // for new-listing detection
  imageHue: number;           // deterministic placeholder art hue for the UI
  channelFlags?: Partial<Record<Platform, ChannelFlags>>;
}
