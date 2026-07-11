// The SQL seam for the Postgres-backed store. One tiny executor interface with two
// implementations: postgres.js against Supabase/any Postgres (prod, via DATABASE_URL with
// the transaction pooler for serverless), and PGlite (embedded WASM Postgres) for tests —
// real Postgres semantics with zero infrastructure, so CI stays server-free.

export interface SqlRow {
  [column: string]: unknown;
}

export interface SqlExecutor {
  query(text: string, params?: unknown[]): Promise<SqlRow[]>;
  close(): Promise<void>;
}

/** Durable world state (JSONB snapshot with optimistic versioning) + append-only relational
 *  mirrors of the two compliance/learning-critical logs, queryable with plain SQL. */
export const BOOTSTRAP_SQL = `
CREATE TABLE IF NOT EXISTS revpilot_world (
  id          INT PRIMARY KEY,
  version     BIGINT NOT NULL,
  state       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS revpilot_audit_events (
  id           TEXT PRIMARY KEY,
  ts           TEXT NOT NULL,
  actor        TEXT NOT NULL,
  kind         TEXT NOT NULL,
  listing_id   TEXT,
  recommendation_id TEXT,
  channel      TEXT,
  detail       TEXT NOT NULL,
  payload      JSONB,
  inserted_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS revpilot_outcomes (
  id           TEXT PRIMARY KEY,
  outcome      JSONB NOT NULL,
  status       TEXT NOT NULL,
  inserted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

/** postgres.js executor — Supabase-ready. Use the transaction-pooler URL (port 6543) on
 *  serverless; prepare:false is required in that mode. */
export async function createPostgresExecutor(databaseUrl: string): Promise<SqlExecutor> {
  const { default: postgres } = await import('postgres');
  const sql = postgres(databaseUrl, {
    prepare: false,
    max: 4,
    onnotice: () => {},
  });
  return {
    async query(text, params = []) {
      return await sql.unsafe(text, params as never[]) as unknown as SqlRow[];
    },
    async close() {
      await sql.end({ timeout: 2 });
    },
  };
}

/** PGlite executor — embedded Postgres for tests (and offline dev). */
export async function createPgliteExecutor(dataDir?: string): Promise<SqlExecutor> {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = dataDir ? new PGlite(dataDir) : new PGlite();
  return {
    async query(text, params = []) {
      const res = await db.query(text, params as unknown[]);
      return res.rows as SqlRow[];
    },
    async close() {
      await db.close();
    },
  };
}
