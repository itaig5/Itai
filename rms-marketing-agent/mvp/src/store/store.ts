// The persistence port. Seed-data mode uses MemoryStore/JsonFileStore; production swaps in
// Postgres (Supabase) behind the same interface — the SQL shape lives in src/db/schema.sql.
import type {
  AuditEvent,
  CalendarNight,
  ClientRecord,
  UserRecord,
  ListingRecord,
  OperatorSettings,
  OtbSnapshot,
  OutcomeRecord,
  PromotionRecord,
  Recommendation,
  RecommendationStatus,
  Reservation,
  VisibilityObservation,
} from '../types.ts';

/** Everything the demo world knows. One JSON-serializable object. */
export interface RevPilotState {
  seed: number;               // PRNG seed the world was generated from
  simDate: string;            // "today" in the demo world (ISO date)
  clients: ClientRecord[];    // the operator accounts whose portfolios RevPilot manages
  users: UserRecord[];        // console logins (admin + per-client read-only viewers)
  listings: ListingRecord[];
  /** listingId -> forward calendar nights (rolling ~120 days) */
  calendar: Record<string, CalendarNight[]>;
  reservations: Reservation[];
  /** listingId -> daily OTB snapshots over the standard forward window */
  snapshots: Record<string, OtbSnapshot[]>;
  /** listingId -> day-of-week-aligned same-time-last-year occupancy for the forward window */
  stlyOccupancy: Record<string, number>;
  /** listingId -> public comp-set median rate (public market data ONLY — legal line) */
  compMedianRate: Record<string, number>;
  visibilityObservations: VisibilityObservation[];
  promotions: PromotionRecord[];
  recommendations: Recommendation[];
  outcomes: OutcomeRecord[];
  audit: AuditEvent[];
  settings: OperatorSettings;
  /** serialized TS-fallback bandit posteriors (the ML service keeps its own registry) */
  banditState: Record<string, { alpha: number; beta: number; pulls: number }>;
  banditModel: string;        // which policy produced banditState
  counters: Record<string, number>; // monotonic id counters (deterministic ids, no Date.now)
}

export interface Store {
  getState(): RevPilotState;
  /** Replace the whole state (seed/reset/advance-day). */
  setState(next: RevPilotState): void;
  /** Apply a mutation and persist. Mutators receive a mutable draft. */
  update(fn: (draft: RevPilotState) => void): RevPilotState;

  // Convenience domain helpers (all go through update()):
  nextId(prefix: string): string;
  appendAudit(e: Omit<AuditEvent, 'id'>): AuditEvent;
  addRecommendation(rec: Recommendation): void;
  setRecommendationStatus(recommendationId: string, status: RecommendationStatus): void;
  addPromotion(p: PromotionRecord): void;
  endPromotion(promotionId: string, endedAt: string, reason: NonNullable<PromotionRecord['endedReason']>): void;
  addOutcome(o: OutcomeRecord): void;
  updateOutcome(id: string, patch: Partial<OutcomeRecord>): void;
  addVisibilityObservation(obs: VisibilityObservation): void;
  setSettings(s: OperatorSettings): void;
}

export class MemoryStore implements Store {
  protected state: RevPilotState;

  constructor(initial: RevPilotState) {
    this.state = initial;
  }

  getState(): RevPilotState {
    return this.state;
  }

  setState(next: RevPilotState): void {
    this.state = next;
    this.persist();
  }

  update(fn: (draft: RevPilotState) => void): RevPilotState {
    fn(this.state);
    this.persist();
    return this.state;
  }

  protected persist(): void {
    // MemoryStore keeps everything in-process; JsonFileStore overrides.
  }

  nextId(prefix: string): string {
    let id = '';
    this.update((s) => {
      const n = (s.counters[prefix] ?? 0) + 1;
      s.counters[prefix] = n;
      id = `${prefix}_${String(n).padStart(5, '0')}`;
    });
    return id;
  }

  appendAudit(e: Omit<AuditEvent, 'id'>): AuditEvent {
    const event: AuditEvent = { ...e, id: this.nextId('evt') };
    this.update((s) => {
      s.audit.push(event); // append-only: nothing in the codebase edits or removes audit rows
    });
    return event;
  }

  addRecommendation(rec: Recommendation): void {
    this.update((s) => {
      s.recommendations.push(rec);
    });
  }

  setRecommendationStatus(recommendationId: string, status: RecommendationStatus): void {
    this.update((s) => {
      const rec = s.recommendations.find((r) => r.recommendationId === recommendationId);
      if (rec) rec.status = status;
    });
  }

  addPromotion(p: PromotionRecord): void {
    this.update((s) => {
      s.promotions.push(p);
    });
  }

  endPromotion(promotionId: string, endedAt: string, reason: NonNullable<PromotionRecord['endedReason']>): void {
    this.update((s) => {
      const p = s.promotions.find((x) => x.id === promotionId);
      if (p && p.status !== 'ended') {
        p.status = 'ended';
        p.endedAt = endedAt;
        p.endedReason = reason;
      }
    });
  }

  addOutcome(o: OutcomeRecord): void {
    this.update((s) => {
      s.outcomes.push(o);
    });
  }

  updateOutcome(id: string, patch: Partial<OutcomeRecord>): void {
    this.update((s) => {
      const o = s.outcomes.find((x) => x.id === id);
      if (o) Object.assign(o, patch);
    });
  }

  addVisibilityObservation(obs: VisibilityObservation): void {
    this.update((s) => {
      s.visibilityObservations.push(obs);
    });
  }

  setSettings(settings: OperatorSettings): void {
    this.update((s) => {
      s.settings = settings;
    });
  }
}

export const DEFAULT_SETTINGS: OperatorSettings = {
  autonomyMode: 'approve_each', // no hidden auto-accept — operator must opt in (RealPage)
  bounds: {
    maxDepthPct: 0.15,
    maxActivePromosPerListing: 2,
    allowedTypes: ['last_minute', 'early_booker', 'weekly_los'],
    minPaceDeficitPct: 0.1,
  },
  maxEffectiveDiscount: 0.35,
  clipFloorPctOfAdr: 0.55,
  autoTurnOffEnabled: true,
  measureAfterDays: 7,
  channels: {
    airbnb: { connected: true, via: 'mock' },
    booking: { connected: true, via: 'mock' },
    expedia: { connected: true, via: 'mock' },
    vrbo: { connected: true, via: 'mock' },
  },
};
