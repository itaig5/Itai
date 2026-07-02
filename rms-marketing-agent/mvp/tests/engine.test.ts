import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRuntime } from '../src/runtime.ts';
import { loadEnv } from '../src/config/env.ts';
import { generateWorld, DEFAULT_SIM_DATE } from '../src/sample/world.ts';
import { advanceDay } from '../src/sample/simulator.ts';
import {
  generateRecommendations, openRecommendations, approveAndPush, rejectRecommendation, buildSignals,
} from '../src/engine/engine.ts';
import { withinBounds, groundingCheck } from '../src/verifier/verifier.ts';
import type { Runtime } from '../src/engine/engine.ts';

// ML service must be unreachable so tests exercise the deterministic TS fallback path.
const testEnv = () => loadEnv({ ML_SERVICE_URL: 'http://127.0.0.1:1' } as NodeJS.ProcessEnv);
const rtFor = (): Runtime => createRuntime({ ephemeral: true, env: testEnv() });

test('generateWorld is deterministic for a given seed', () => {
  const a = generateWorld({ seed: 7 });
  const b = generateWorld({ seed: 7 });
  assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
  const c = generateWorld({ seed: 8 });
  assert.notDeepEqual(a.reservations.length, 0);
  assert.notEqual(JSON.stringify(a.calendar), JSON.stringify(c.calendar));
});

test('the seeded world tells its stories: behind, ahead, visibility drop, stacked hazard', async () => {
  const rt = rtFor();
  const marina = await buildSignals(rt.store, rt.visibility, 'L-MARINA');
  assert.ok(marina.paceVsStlyPct <= -0.15, `marina should be far behind, got ${marina.paceVsStlyPct}`);
  assert.ok(marina.compGapPct >= 0.1, `marina should be overpriced, got ${marina.compGapPct}`);

  const harbor = await buildSignals(rt.store, rt.visibility, 'L-HARBOR');
  assert.ok(harbor.paceVsStlyPct >= 0.1, `harbor should be ahead, got ${harbor.paceVsStlyPct}`);

  const chalet = await buildSignals(rt.store, rt.visibility, 'L-CHALET');
  const bookingVis = chalet.visibility?.find((v) => v.platform === 'booking');
  assert.ok(bookingVis?.dropDetected, 'chalet booking visibility drop should be detected');

  const cedar = await buildSignals(rt.store, rt.visibility, 'L-CEDAR');
  assert.ok((cedar.orphanGapCount ?? 0) > 0, 'cedar should have orphan gaps');
});

test('generateRecommendations: feed covers promo, visibility (with guided actions), remove-discounts', async () => {
  const rt = rtFor();
  const generated = await generateRecommendations(rt);
  assert.ok(generated.length >= 4, `expected a rich feed, got ${generated.length}`);

  const byListing = new Map(generated.map((g) => [g.rec.listingId, g]));
  const marina = byListing.get('L-MARINA');
  assert.ok(marina, 'marina should get a recommendation');
  assert.ok(['last_minute', 'basic_deal', 'early_booker'].includes(marina.rec.move.type));
  assert.ok(marina.rec.move.depthPct >= 0.1 && marina.rec.move.depthPct <= 0.25);
  assert.ok((marina.rec.targetChannels ?? []).length >= 3, 'multi-channel push targets');
  assert.ok(marina.rec.banditChoice, 'bandit should have chosen the arm');
  assert.equal(marina.rec.requiresHumanApproval, true);

  const chalet = byListing.get('L-CHALET');
  assert.ok(chalet, 'chalet should get a visibility recommendation');
  assert.equal(chalet.rec.finding.signal, 'visibility_drop');
  assert.ok((chalet.rec.guidedActions ?? []).some((a) => a.kind === 'program_enrollment'));
  assert.ok(chalet.report.pass, `chalet verifier must pass — rationale numbers grounded (${chalet.report.checks.filter((c) => !c.pass).map((c) => c.detail).join('; ')})`);

  const harbor = byListing.get('L-HARBOR');
  assert.ok(harbor, 'harbor should get a remove-discounts recommendation');
  assert.equal(harbor.rec.move.type, 'remove_discounts');

  // SUNSET: genius+mobile+operator 20% deal -> adding a promo breaches the 35% cap on booking
  const sunset = byListing.get('L-SUNSET');
  assert.ok(sunset, 'sunset should get a recommendation');
  const bookingGuard = sunset.report.guards.find((g) => g.channel === 'booking');
  assert.ok(bookingGuard && !bookingGuard.approved, 'booking must be guard-blocked for sunset');
  const otherGuards = sunset.report.guards.filter((g) => g.channel !== 'booking');
  assert.ok(otherGuards.some((g) => g.approved), 'other channels should be safe for sunset');

  // dedup: a second sweep must not duplicate open recommendations
  const again = await generateRecommendations(rt);
  assert.equal(again.filter((g) => byListing.has(g.rec.listingId) && g.rec.finding.signal === byListing.get(g.rec.listingId)!.rec.finding.signal).length, 0);
});

test('approve once -> dry-run previews everywhere without writing', async () => {
  const rt = rtFor();
  await generateRecommendations(rt);
  const feed = await openRecommendations(rt);
  const marina = feed.find((f) => f.rec.listingId === 'L-MARINA')!;
  const promosBefore = rt.store.getState().promotions.length;

  const summary = await approveAndPush(rt, marina.rec.recommendationId, { dryRun: true });
  assert.equal(summary.dryRun, true);
  assert.ok(summary.results.length >= 3, 'per-channel results');
  assert.ok(summary.results.every((r) => r.execution.status === 'dry_run' || r.execution.status === 'blocked'));
  assert.equal(rt.store.getState().promotions.length, promosBefore, 'dry run must not create promotions');
  assert.equal(rt.store.getState().recommendations.find((r) => r.recommendationId === marina.rec.recommendationId)?.status, 'proposed');
  assert.equal(summary.outcomeId, null);
});

test('approve once -> live push executes on every safe channel, opens the outcome row, audits', async () => {
  const rt = rtFor();
  await generateRecommendations(rt);
  const feed = await openRecommendations(rt);
  const marina = feed.find((f) => f.rec.listingId === 'L-MARINA')!;

  const summary = await approveAndPush(rt, marina.rec.recommendationId, { dryRun: false });
  assert.ok(summary.executedChannels.length >= 3, `expected multi-channel execution, got ${summary.executedChannels}`);
  const state = rt.store.getState();
  const created = state.promotions.filter((p) => p.recommendationId === marina.rec.recommendationId);
  assert.equal(created.length, summary.executedChannels.length, 'one promotion per executed channel');
  assert.ok(created.every((p) => p.status === 'active' && p.source === 'revpilot'));
  assert.ok(summary.outcomeId, 'outcome row opened');
  assert.equal(state.outcomes.find((o) => o.id === summary.outcomeId)?.status, 'pending');
  assert.ok(state.audit.some((e) => e.kind === 'approved' && e.recommendationId === marina.rec.recommendationId));
  assert.ok(state.audit.some((e) => e.kind === 'executed' && e.recommendationId === marina.rec.recommendationId));
  assert.equal(state.recommendations.find((r) => r.recommendationId === marina.rec.recommendationId)?.status, 'executed');

  // idempotent retry: approving again must fail cleanly (status is no longer proposed)
  await assert.rejects(() => approveAndPush(rt, marina.rec.recommendationId, { dryRun: false }));
});

test('sunset live push: guardrail blocks booking, executes the safe channels', async () => {
  const rt = rtFor();
  await generateRecommendations(rt);
  const feed = await openRecommendations(rt);
  const sunset = feed.find((f) => f.rec.listingId === 'L-SUNSET')!;
  const summary = await approveAndPush(rt, sunset.rec.recommendationId, { dryRun: false });
  assert.ok(summary.blockedChannels.includes('booking'), 'booking blocked by double-discount guard');
  assert.ok(summary.executedChannels.length >= 1, 'other channels still executed');
  const state = rt.store.getState();
  assert.ok(state.audit.some((e) => e.kind === 'guardrail_block' && e.channel === 'booking' && e.listingId === 'L-SUNSET'));
  assert.ok(!state.promotions.some((p) => p.recommendationId === sunset.rec.recommendationId && p.channel === 'booking'));
});

test('reject records the decision', async () => {
  const rt = rtFor();
  await generateRecommendations(rt);
  const feed = await openRecommendations(rt);
  const target = feed[0].rec.recommendationId;
  await rejectRecommendation(rt, target);
  const state = rt.store.getState();
  assert.equal(state.recommendations.find((r) => r.recommendationId === target)?.status, 'rejected');
  assert.ok(state.audit.some((e) => e.kind === 'rejected' && e.recommendationId === target));
});

test('advanceDay: sim moves, snapshots append, recovered promos auto-turn-off', async () => {
  const rt = rtFor();
  const before = rt.store.getState();
  const harborActive = before.promotions.filter((p) => p.listingId === 'L-HARBOR' && p.status === 'active');
  assert.ok(harborActive.length >= 1, 'seed world has active harbor promos');
  const snapsBefore = (before.snapshots['L-MARINA'] ?? []).length;

  const summary = await advanceDay(rt);
  const after = rt.store.getState();
  assert.equal(after.simDate, summary.date);
  assert.ok(after.simDate > DEFAULT_SIM_DATE);
  assert.equal((after.snapshots['L-MARINA'] ?? []).length, snapsBefore + 1, 'daily OTB snapshot appended');
  // Harbor is pacing ahead — auto-turn-off must end its promos (doc 12 §1)
  const harborAfter = after.promotions.filter((p) => p.listingId === 'L-HARBOR' && p.status === 'active');
  assert.equal(harborAfter.length, 0, 'harbor promos auto-ended on pace recovery');
  assert.ok(after.promotions.some((p) => p.listingId === 'L-HARBOR' && p.endedReason === 'pace_recovered'),
    'auto-off must record the TRUE reason, not the adapter default');
  assert.ok(after.audit.some((e) => e.kind === 'promo_ended' && e.listingId === 'L-HARBOR'));
});

test('the full learning loop closes: execute -> simulate days -> outcome measured -> bandit updated', async () => {
  const rt = rtFor();
  await generateRecommendations(rt);
  const feed = await openRecommendations(rt);
  const marina = feed.find((f) => f.rec.listingId === 'L-MARINA')!;
  const summary = await approveAndPush(rt, marina.rec.recommendationId, { dryRun: false });
  assert.ok(summary.outcomeId);

  const banditBefore = JSON.stringify(rt.store.getState().banditState);
  for (let i = 0; i < 8; i++) await advanceDay(rt); // past the 7-day measurement horizon

  const state = rt.store.getState();
  const outcome = state.outcomes.find((o) => o.id === summary.outcomeId)!;
  assert.equal(outcome.status, 'measured');
  assert.ok(outcome.reward != null && outcome.reward >= 0 && outcome.reward <= 1);
  assert.ok(outcome.result, 'result metrics recorded');
  assert.notEqual(JSON.stringify(state.banditState), banditBefore, 'bandit posteriors moved');
  assert.ok(state.audit.some((e) => e.kind === 'outcome_measured' && e.recommendationId === marina.rec.recommendationId));
  assert.ok(state.audit.some((e) => e.kind === 'bandit_update'));
});

test('withinBounds enforces the operator-set autonomy bounds', async () => {
  const rt = rtFor();
  await generateRecommendations(rt);
  const feed = await openRecommendations(rt);
  const marina = feed.find((f) => f.rec.listingId === 'L-MARINA')!;
  const settings = rt.store.getState().settings;

  // default mode: approve-each -> never auto
  assert.equal(withinBounds(marina.rec, settings, 0).ok, false);

  const auto = { ...settings, autonomyMode: 'auto_within_bounds' as const };
  const deep = { ...marina.rec, move: { ...marina.rec.move, depthPct: 0.25 } };
  assert.equal(withinBounds(deep, auto, 0).ok, false, 'depth above operator max');
  const disallowed = { ...marina.rec, move: { ...marina.rec.move, type: 'basic_deal' as const } };
  assert.equal(withinBounds(disallowed, { ...auto, bounds: { ...auto.bounds, allowedTypes: ['last_minute'] } }, 0).ok, false);
  assert.equal(withinBounds(marina.rec, auto, 5).ok, false, 'too many active promos');
  if (marina.rec.move.depthPct <= auto.bounds.maxDepthPct && auto.bounds.allowedTypes.includes(marina.rec.move.type)) {
    assert.equal(withinBounds(marina.rec, auto, 0).ok, true);
  }
});

test('groundingCheck rejects rationale numbers that trace to no signal', () => {
  const rt = rtFor();
  const state = rt.store.getState();
  const rec = {
    ...state.recommendations[0],
    move: { ...state.recommendations[0].move, rationale: 'Occupancy will rise 73% guaranteed' },
  };
  assert.equal(groundingCheck(rec).pass, false);
});
