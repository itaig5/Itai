import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRuntime } from '../src/runtime.ts';
import { loadEnv } from '../src/config/env.ts';
import { addClient, connectClient, disconnectClient, toClientView } from '../src/clients/clientService.ts';
import { buildSignals, generateRecommendations } from '../src/engine/engine.ts';

const rtFor = () => createRuntime({
  ephemeral: true,
  env: loadEnv({ ML_SERVICE_URL: 'http://127.0.0.1:1' } as NodeJS.ProcessEnv),
});

test('the seed world ships with one connected demo client owning all listings', () => {
  const rt = rtFor();
  const state = rt.store.getState();
  assert.equal(state.clients.length, 1);
  assert.equal(state.clients[0].status, 'connected');
  assert.equal(state.clients[0].listingIds.length, state.listings.length);
  assert.ok(state.listings.every((l) => l.clientId === state.clients[0].id));
});

test('addClient validates input and never leaks secrets through the view', () => {
  const rt = rtFor();
  assert.throws(() => addClient(rt.store, { name: '', contactEmail: 'a@b.co', market: 'x', channelManager: 'demo' }), /name/);
  assert.throws(() => addClient(rt.store, { name: 'X', contactEmail: 'nope', market: 'x', channelManager: 'demo' }), /email/);
  assert.throws(
    () => addClient(rt.store, { name: 'X', contactEmail: 'a@b.co', market: 'x', channelManager: 'guesty' }),
    /client id \+ secret/,
  );

  const c = addClient(rt.store, {
    name: 'Blue Door BnB', contactEmail: 'omer@bluedoor.co', market: 'Tel Aviv',
    channelManager: 'guesty', credentials: { clientId: 'gid-123', clientSecret: 'super-secret-9876' },
  });
  assert.equal(c.status, 'pending');
  const view = toClientView(rt.store, rt.store.getState().clients.find((x) => x.id === c.id)!);
  assert.ok(!JSON.stringify(view).includes('super-secret-9876'), 'secret must not appear in the view');
  assert.match(view.credentialHint!, /9876$/);
  assert.ok(rt.store.getState().audit.some((e) => e.kind === 'client_added'));

  // duplicate name rejected
  assert.throws(
    () => addClient(rt.store, { name: 'blue door bnb', contactEmail: 'x@y.co', market: 'z', channelManager: 'demo' }),
    /already exists/,
  );
});

test('connecting a demo client imports a working portfolio the brain can reason over', async () => {
  const rt = rtFor();
  const before = rt.store.getState().listings.length;
  const c = addClient(rt.store, { name: 'Golden Hour Homes', contactEmail: 'gal@ghh.io', market: 'Lisbon', channelManager: 'demo' });
  const res = await connectClient(rt.store, c.id, { env: rt.env, demoListingCount: 3 });

  assert.equal(res.status, 'connected');
  assert.equal(res.importedListingIds.length, 3);
  const state = rt.store.getState();
  assert.equal(state.listings.length, before + 3);
  const imported = state.listings.filter((l) => l.clientId === c.id);
  assert.equal(imported.length, 3);
  assert.ok(imported.every((l) => (state.calendar[l.id] ?? []).length > 0), 'calendar generated');
  assert.ok(imported.every((l) => (state.snapshots[l.id] ?? []).length > 1), 'pace history generated');

  // signals compute cleanly and the sweep can produce recommendations for the new listings
  const signals = await buildSignals(rt.store, rt.visibility, imported[0].id);
  assert.equal(signals.missing.length, 0, `no missing inputs, got: ${signals.missing}`);
  await generateRecommendations(rt);
  assert.ok(state.audit.some((e) => e.kind === 'client_connected'));

  // re-sync is idempotent even WITHOUT restating the count — the client remembers its size
  const again = await connectClient(rt.store, c.id, { env: rt.env });
  assert.equal(again.status, 'connected');
  assert.equal(again.importedListingIds.length, 0);
  assert.equal(rt.store.getState().listings.length, before + 3);
});

test('guesty client: bad credentials surface as an error status, not a crash', async () => {
  const rt = rtFor();
  const c = addClient(rt.store, {
    name: 'Reef Apartments', contactEmail: 'noa@reef.co', market: 'Eilat',
    channelManager: 'guesty', credentials: { clientId: 'gid', clientSecret: 'bad' },
  });
  const failingFetch: typeof fetch = () => Promise.reject(new Error('ENOTFOUND open-api.guesty.com'));
  const res = await connectClient(rt.store, c.id, { env: rt.env, fetchImpl: failingFetch });
  assert.equal(res.status, 'error');
  const state = rt.store.getState();
  assert.equal(state.clients.find((x) => x.id === c.id)?.status, 'error');
  assert.ok(state.audit.some((e) => e.kind === 'client_error'));
  assert.equal(state.listings.filter((l) => l.clientId === c.id).length, 0, 'nothing imported on failure');
});

test('guesty client: a working account imports listings pending their first sync', async () => {
  const rt = rtFor();
  const c = addClient(rt.store, {
    name: 'Reef Apartments', contactEmail: 'noa@reef.co', market: 'Eilat',
    channelManager: 'guesty', credentials: { clientId: 'gid', clientSecret: 'ok' },
  });
  const okFetch: typeof fetch = async (url) => {
    const u = String(url);
    if (u.includes('/oauth2/token')) {
      return new Response(JSON.stringify({ access_token: 'tok', expires_in: 86400 }), { status: 200 });
    }
    if (u.includes('/listings')) {
      return new Response(JSON.stringify({
        results: [
          { _id: 'g1', title: 'Reef Penthouse' },
          { _id: 'g2', title: 'Reef Studio' },
        ],
        count: 2,
      }), { status: 200 });
    }
    return new Response('{}', { status: 200 });
  };
  const res = await connectClient(rt.store, c.id, { env: rt.env, fetchImpl: okFetch });
  assert.equal(res.status, 'connected');
  assert.equal(res.importedListingIds.length, 2);
  const state = rt.store.getState();
  const imported = state.listings.filter((l) => l.clientId === c.id);
  assert.deepEqual(imported.map((l) => l.name).sort(), ['Reef Penthouse', 'Reef Studio']);
  // no history yet -> signals honestly report missing inputs, so the engine emits NO_ACTION
  const signals = await buildSignals(rt.store, rt.visibility, imported[0].id);
  assert.ok(signals.missing.length > 0, 'fresh CM imports must be flagged until the first sync');
});

test('disconnect keeps history but marks the client disabled', async () => {
  const rt = rtFor();
  const c = addClient(rt.store, { name: 'Golden Hour Homes', contactEmail: 'gal@ghh.io', market: 'Lisbon', channelManager: 'demo' });
  await connectClient(rt.store, c.id, { env: rt.env, demoListingCount: 2 });
  disconnectClient(rt.store, c.id);
  const state = rt.store.getState();
  assert.equal(state.clients.find((x) => x.id === c.id)?.status, 'disabled');
  assert.equal(state.listings.filter((l) => l.clientId === c.id).length, 2, 'listings retained');
  assert.ok(state.audit.some((e) => e.kind === 'client_disconnected'));
  await assert.rejects(() => connectClient(rt.store, c.id, { env: rt.env }), /disabled/);
});
