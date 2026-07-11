import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMonthlySnapshotCsv, materializeProperty } from '../src/clients/sheetsImport.ts';
import { addClient, connectClient } from '../src/clients/clientService.ts';
import { buildSignals, generateRecommendations, openRecommendations, approveAndPush } from '../src/engine/engine.ts';
import { createRuntime } from '../src/runtime.ts';
import { loadEnv } from '../src/config/env.ts';

// Fictional fixture shaped like a real weekly-OTB revenue sheet:
// a 14-room seasonal hotel, weekly as-of snapshots per stay-month, targets, expected ADR,
// and same-time-last-year — May pacing WELL ahead, July badly behind its own STLY.
const FIXTURE_CSV = `property,rooms,month,asOf,roomNights,income,occTarget,revenueTarget,expectedAdr,stlyRoomNights,stlyIncome
Harbor House,14,2026-05,2026-06-01,290,37500,75,56000,130,,
Harbor House,14,2026-05,2026-06-25,380,49000,75,56000,130,260,33000
Harbor House,14,2026-06,2026-06-01,200,36000,92,95000,190,100,17000
Harbor House,14,2026-06,2026-06-25,245,45000,92,95000,190,120,21000
Harbor House,14,2026-07,2026-06-01,40,10000,95,125000,240,,
Harbor House,14,2026-07,2026-06-25,65,16500,95,125000,240,180,43000
Harbor House,14,2026-08,2026-06-25,90,24500,95,138000,260,110,28000
totally,broken,row,,,
Harbor House,14,2026-09,2026-06-25,75,15500,90,92000,180,95,18500`;

const rtFor = () => createRuntime({
  ephemeral: true,
  env: loadEnv({ ML_SERVICE_URL: 'http://127.0.0.1:1' } as NodeJS.ProcessEnv),
});

test('parser: reads the canonical layout, tolerates junk rows, normalizes percent targets', () => {
  const { property, skipped } = parseMonthlySnapshotCsv(FIXTURE_CSV);
  assert.equal(property.name, 'Harbor House');
  assert.equal(property.rooms, 14);
  assert.equal(property.months.length, 5);
  assert.equal(skipped.length, 1, 'the broken row is reported, not fatal');

  const june = property.months.find((m) => m.month === '2026-06')!;
  assert.equal(june.availableRoomNights, 14 * 30);
  assert.equal(june.occTarget, 0.92, '"92" normalizes to 0.92');
  assert.equal(june.snapshots.length, 2);
  assert.equal(june.snapshots[1].roomNights, 245);
  assert.equal(june.stlyRoomNights, 120, 'latest STLY value wins');

  assert.throws(() => parseMonthlySnapshotCsv('month,asOf\n2026-06,2026-01-01'), /missing a "roomnights"/);
});

test('materialize: monthly OTB becomes engine-shaped world with faithful occupancy + pace', () => {
  const { property } = parseMonthlySnapshotCsv(FIXTURE_CSV);
  const m = materializeProperty('cl_00009', property, '2026-06-26');

  assert.match(m.listing.id, /^CL00009-/);
  assert.ok(m.monthsLoaded.includes('2026-07') && m.monthsLoaded.includes('2026-09'));
  assert.ok(!m.monthsLoaded.includes('2026-05'), 'past months excluded');

  // snapshot series aggregates forward months per as-of — pickup is computable
  assert.equal(m.snapshots.length, 2);
  assert.ok(m.snapshots[1].bookedNights > m.snapshots[0].bookedNights);

  // July occupancy in the rendered calendar tracks the sheet (65 / (14*31) ≈ 15%)
  const julyNights = m.calendar.filter((n) => n.stayDate.startsWith('2026-07'));
  const julyOcc = julyNights.filter((n) => n.booked).length / julyNights.length;
  assert.ok(Math.abs(julyOcc - 65 / (14 * 31)) < 0.05, `july occ ${julyOcc}`);
});

test('end-to-end: sheets client connects, gets GUIDED recommendations, approval issues checklists (no writes)', async () => {
  const rt = rtFor();
  const client = addClient(rt.store, {
    name: 'Harbor House Hotel', contactEmail: 'gm@harborhouse.gr', market: 'Paros',
    channelManager: 'sheets', sheetsCsv: FIXTURE_CSV,
  });
  const res = await connectClient(rt.store, client.id, { env: rt.env });
  assert.equal(res.status, 'connected');
  assert.match(res.detail, /GUIDED tier/);
  assert.equal(res.importedListingIds.length, 1);
  const listingId = res.importedListingIds[0];

  // signals: real pace math on the sheet's numbers; missing comp feed is tolerated
  const signals = await buildSignals(rt.store, rt.visibility, listingId);
  assert.ok(signals.missing.includes('compMedianRate'), 'no market feed for sheet clients');
  assert.ok(signals.paceVsStlyPct < -0.05, `july/aug weight should read behind STLY, got ${signals.paceVsStlyPct}`);

  await generateRecommendations(rt);
  const open = await openRecommendations(rt);
  const rec = open.find((r) => r.rec.listingId === listingId);
  assert.ok(rec, 'a recommendation for the sheet client');
  assert.equal(rec.rec.move.tier, 'guided', 'no API -> guided tier');
  assert.ok(rec.report.pass, `verifier passes despite missing comp feed: ${JSON.stringify(rec.report.checks.filter((c) => !c.pass))}`);

  // approve once -> guided checklists, NOT channel writes
  const promosBefore = rt.store.getState().promotions.length;
  const push = await approveAndPush(rt, rec.rec.recommendationId, { dryRun: false });
  assert.ok(push.results.every((r) => r.execution.status === 'guided' || r.execution.status === 'blocked'));
  assert.equal(rt.store.getState().promotions.length, promosBefore, 'guided tier writes nothing');
  const state = rt.store.getState();
  assert.equal(state.recommendations.find((r) => r.recommendationId === rec.rec.recommendationId)?.status, 'executed');
  assert.ok(state.audit.some((e) => e.kind === 'guided_step' && e.listingId === listingId));

  // weekly re-sync replaces in place — no duplicate listings
  const again = await connectClient(rt.store, client.id, { env: rt.env, sheetsCsv: FIXTURE_CSV });
  assert.equal(again.status, 'connected');
  assert.equal(rt.store.getState().listings.filter((l) => l.clientId === client.id).length, 1);
});
