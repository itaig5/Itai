import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRuntime } from '../src/runtime.ts';
import { loadEnv } from '../src/config/env.ts';
import { HitlRunner } from '../src/workflow/hitl.ts';

const rtFor = () => createRuntime({
  ephemeral: true,
  env: loadEnv({ ML_SERVICE_URL: 'http://127.0.0.1:1' } as NodeJS.ProcessEnv),
});

test('HITL workflow suspends at the approval gate with the rec + verifier report', async () => {
  const rt = rtFor();
  const runner = new HitlRunner(rt);
  const handle = await runner.start('L-MARINA');
  assert.equal(handle.status, 'suspended');
  assert.ok(handle.pending?.rec, 'pending recommendation surfaced to the operator');
  assert.ok(handle.pending?.report?.pass, 'verifier report attached and green');
  assert.equal(handle.pending.rec.listingId, 'L-MARINA');
  assert.ok(handle.pending.rec.move.depthPct > 0);
});

test('resume(approved, dryRun) previews; resume(approved) executes everywhere; audit shows both', async () => {
  const rt = rtFor();
  const runner = new HitlRunner(rt);

  const preview = await runner.start('L-MARINA');
  assert.equal(preview.status, 'suspended');
  const previewDone = await runner.resume(preview.runId, { approved: true, dryRun: true });
  assert.equal(previewDone.status, 'success');
  assert.equal(previewDone.result?.status, 'dry_run');
  assert.equal(rt.store.getState().promotions.filter((p) => p.listingId === 'L-MARINA').length, 0);

  const live = await runner.start('L-CASITA');
  assert.equal(live.status, 'suspended');
  const liveDone = await runner.resume(live.runId, { approved: true, approvalToken: 'op-tester' });
  assert.equal(liveDone.status, 'success');
  assert.equal(liveDone.result?.status, 'executed');
  assert.ok((liveDone.result?.push?.executedChannels.length ?? 0) >= 3, 'approve once -> pushed to all channels');
  const state = rt.store.getState();
  assert.ok(state.promotions.some((p) => p.listingId === 'L-CASITA' && p.status === 'active' && p.source === 'revpilot'));
  assert.ok(state.outcomes.some((o) => o.listingId === 'L-CASITA' && o.status === 'pending'));
});

test('resume(rejected) records the rejection and writes nothing', async () => {
  const rt = rtFor();
  const runner = new HitlRunner(rt);
  const handle = await runner.start('L-MARINA');
  const done = await runner.resume(handle.runId, { approved: false });
  assert.equal(done.status, 'success');
  assert.equal(done.result?.status, 'rejected');
  const state = rt.store.getState();
  assert.equal(state.promotions.filter((p) => p.listingId === 'L-MARINA').length, 0);
  assert.ok(state.audit.some((e) => e.kind === 'rejected' && e.listingId === 'L-MARINA'));
});

test('healthy listing -> NO_ACTION without suspending (the hallucination guardrail)', async () => {
  const rt = rtFor();
  const runner = new HitlRunner(rt);
  const handle = await runner.start('L-GARDEN');
  assert.equal(handle.status, 'success');
  assert.equal(handle.result?.status, 'no_action');
});
