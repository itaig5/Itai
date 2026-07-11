// Postgres-backed Store (Supabase-ready): same MemoryStore semantics the whole engine runs
// on, persisted durably — the full world as a versioned JSONB snapshot, plus append-only
// relational mirrors of the audit trail and outcome log (the compliance/learning tables you
// want queryable with plain SQL). Writes are serialized through a queue and use optimistic
// versioning, so a concurrent writer (second serverless instance) fails loudly instead of
// silently clobbering state.
import type { AuditEvent, OutcomeRecord } from '../types.ts';
import { MemoryStore, type RevPilotState } from './store.ts';
import { BOOTSTRAP_SQL, type SqlExecutor } from './sql.ts';

export class PostgresStore extends MemoryStore {
  private sql: SqlExecutor;
  private version: number;
  private writeChain: Promise<void> = Promise.resolve();
  private mirroredAudit = 0;
  private mirroredOutcomes = new Map<string, string>(); // id -> serialized row last mirrored
  private lastError: Error | null = null;

  private constructor(sql: SqlExecutor, state: RevPilotState, version: number, alreadyMirrored: boolean) {
    super(state);
    this.sql = sql;
    this.version = version;
    if (alreadyMirrored) {
      // reloading a persisted world: its rows are in the mirror tables from previous runs
      this.mirroredAudit = state.audit.length;
      for (const o of state.outcomes) this.mirroredOutcomes.set(o.id, JSON.stringify(o));
    }
  }

  /** Bootstrap the schema, then load the world (or seed it with `fallback()`). */
  static async load(sql: SqlExecutor, fallback: () => RevPilotState): Promise<PostgresStore> {
    // one statement per call — extended-protocol clients (PGlite, pooled pg) reject scripts
    for (const stmt of BOOTSTRAP_SQL.split(';').map((s) => s.trim()).filter(Boolean)) {
      await sql.query(stmt);
    }
    const rows = await sql.query('SELECT version, state FROM revpilot_world WHERE id = 1');
    if (rows.length > 0) {
      const state = (typeof rows[0].state === 'string' ? JSON.parse(rows[0].state as string) : rows[0].state) as RevPilotState;
      return new PostgresStore(sql, state, Number(rows[0].version), true);
    }
    const seeded = fallback();
    await sql.query(
      'INSERT INTO revpilot_world (id, version, state) VALUES (1, 1, $1)',
      [JSON.stringify(seeded)],
    );
    const store = new PostgresStore(sql, seeded, 1, false);
    await store.mirrorAppendOnly(seeded); // the seed world's history belongs in the mirrors too
    return store;
  }

  protected override persist(): void {
    // MemoryStore mutators are synchronous; ship the write asynchronously but IN ORDER.
    const snapshot = JSON.stringify(this.state);
    const nextVersion = ++this.version;
    const audit = this.state.audit;
    const outcomes = this.state.outcomes;
    this.writeChain = this.writeChain.then(async () => {
      const updated = await this.sql.query(
        'UPDATE revpilot_world SET state = $1, version = $2, updated_at = now() WHERE id = 1 AND version = $3 RETURNING id',
        [snapshot, nextVersion, nextVersion - 1],
      );
      if (updated.length === 0) {
        throw new Error(
          `optimistic lock failed at version ${nextVersion - 1} — another RevPilot instance wrote concurrently`,
        );
      }
      await this.mirrorAppendOnly({ audit, outcomes });
    }).catch((err) => {
      this.lastError = err instanceof Error ? err : new Error(String(err));
      console.error('[postgres-store] persist failed:', this.lastError.message);
    });
  }

  private async mirrorAppendOnly(s: { audit: AuditEvent[]; outcomes: OutcomeRecord[] }): Promise<void> {
    for (; this.mirroredAudit < s.audit.length; this.mirroredAudit++) {
      const e = s.audit[this.mirroredAudit];
      await this.sql.query(
        `INSERT INTO revpilot_audit_events (id, ts, actor, kind, listing_id, recommendation_id, channel, detail, payload)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO NOTHING`,
        [e.id, e.ts, e.actor, e.kind, e.listingId ?? null, e.recommendationId ?? null,
          e.channel ?? null, e.detail, e.payload === undefined ? null : JSON.stringify(e.payload)],
      );
    }
    for (const o of s.outcomes) {
      const serialized = JSON.stringify(o);
      if (this.mirroredOutcomes.get(o.id) === serialized) continue; // any field change re-mirrors
      await this.sql.query(
        `INSERT INTO revpilot_outcomes (id, outcome, status) VALUES ($1,$2,$3)
         ON CONFLICT (id) DO UPDATE SET outcome = EXCLUDED.outcome, status = EXCLUDED.status, updated_at = now()`,
        [o.id, serialized, o.status],
      );
      this.mirroredOutcomes.set(o.id, serialized);
    }
  }

  /** Await all queued writes (tests / graceful shutdown). Throws if any write failed. */
  async flush(): Promise<void> {
    await this.writeChain;
    if (this.lastError) {
      const err = this.lastError;
      this.lastError = null;
      throw err;
    }
  }

  async closeStore(): Promise<void> {
    await this.flush().catch(() => {});
    await this.sql.close();
  }
}
