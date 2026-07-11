import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PostgresStore } from '../src/store/postgresStore.ts';
import { createPgliteExecutor, type SqlExecutor } from '../src/store/sql.ts';
import { generateWorld } from '../src/sample/world.ts';

// PGlite = embedded real Postgres — these tests exercise the exact SQL the Supabase
// deployment runs, with zero external infrastructure.

async function freshStore(sql?: SqlExecutor) {
  const executor = sql ?? await createPgliteExecutor();
  const store = await PostgresStore.load(executor, () => generateWorld({ seed: 7 }));
  return { executor, store };
}

test('postgres store: seeds once, then reloads the SAME world from the database', async () => {
  const executor = await createPgliteExecutor();
  const first = await PostgresStore.load(executor, () => generateWorld({ seed: 7 }));
  const day1 = first.getState().simDate;
  first.update((s) => { s.simDate = '2027-01-01'; });
  await first.flush();

  // a second boot must load the persisted world, NOT re-seed
  const second = await PostgresStore.load(executor, () => generateWorld({ seed: 999 }));
  assert.equal(second.getState().simDate, '2027-01-01');
  assert.notEqual(second.getState().simDate, day1);
  assert.equal(second.getState().listings.length, 8, 'world survived the round-trip');
  await executor.close();
});

test('postgres store: mutations persist in order and the audit mirror is queryable SQL', async () => {
  const { executor, store } = await freshStore();
  const seededAudit = store.getState().audit.length;

  store.appendAudit({ ts: '2026-07-02', actor: 'operator', kind: 'approved', detail: 'first' });
  store.appendAudit({ ts: '2026-07-03', actor: 'system', kind: 'executed', detail: 'second', channel: 'booking' });
  await store.flush();

  const rows = await executor.query('SELECT kind, detail, channel FROM revpilot_audit_events ORDER BY inserted_at, id');
  assert.equal(rows.length, seededAudit + 2, 'every audit event mirrored relationally');
  assert.equal(rows[rows.length - 1].detail, 'second');
  assert.equal(rows[rows.length - 1].channel, 'booking');

  const world = await executor.query('SELECT version FROM revpilot_world WHERE id = 1');
  assert.ok(Number(world[0].version) > 1, 'version advances with writes');
  await executor.close();
});

test('postgres store: outcome mirror upserts on measurement (pending -> measured)', async () => {
  const { executor, store } = await freshStore();
  const outcome = store.getState().outcomes[0];
  store.updateOutcome(outcome.id, { status: 'measured', reward: 0.5, measuredAt: '2026-07-09' });
  await store.flush();

  const rows = await executor.query('SELECT status, outcome FROM revpilot_outcomes WHERE id = $1', [outcome.id]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, 'measured');
  const stored = typeof rows[0].outcome === 'string' ? JSON.parse(rows[0].outcome as string) : rows[0].outcome;
  assert.equal(stored.reward, 0.5);
  await executor.close();
});

test('postgres store: a concurrent writer trips the optimistic lock instead of clobbering', async () => {
  const executor = await createPgliteExecutor();
  const a = await PostgresStore.load(executor, () => generateWorld({ seed: 7 }));
  const b = await PostgresStore.load(executor, () => generateWorld({ seed: 7 }));

  a.update((s) => { s.simDate = '2027-02-01'; });
  await a.flush();

  b.update((s) => { s.simDate = '2027-03-01'; }); // b still believes version 1
  await assert.rejects(() => b.flush(), /optimistic lock/);

  const world = await executor.query('SELECT state FROM revpilot_world WHERE id = 1');
  const state = typeof world[0].state === 'string' ? JSON.parse(world[0].state as string) : world[0].state;
  assert.equal(state.simDate, '2027-02-01', "a's write survived; b failed loudly");
  await executor.close();
});
