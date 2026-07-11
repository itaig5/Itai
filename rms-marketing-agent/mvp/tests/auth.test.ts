import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore } from '../src/store/store.ts';
import { generateWorld } from '../src/sample/world.ts';
import { hashPassword, verifyPassword, generatePassword } from '../src/auth/passwords.ts';
import { createUser, verifyCredentials, ensureAdminUser, toUserView } from '../src/auth/users.ts';
import { createSessionToken, verifySessionToken } from '../src/auth/session.ts';

const storeFor = () => new MemoryStore(generateWorld({ seed: 7 }));

test('passwords: scrypt hash verifies, rejects wrong password, enforces length', () => {
  const hash = hashPassword('correct-horse');
  assert.ok(verifyPassword('correct-horse', hash));
  assert.ok(!verifyPassword('wrong-horse', hash));
  assert.ok(!verifyPassword('correct-horse', 'garbage'));
  assert.throws(() => hashPassword('short'), /at least 8/);
  const gen = generatePassword();
  assert.match(gen, /^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
});

test('users: create/verify/duplicates/client-scoping rules, and views never leak hashes', () => {
  const store = storeFor();
  ensureAdminUser(store, { email: 'admin@revpilot.demo', password: 'revpilot-demo' });
  assert.equal(store.getState().users.length, 1);
  // idempotent
  ensureAdminUser(store, { email: 'other@x.co', password: 'irrelevant-pw' });
  assert.equal(store.getState().users.length, 1);

  const clientId = store.getState().clients[0].id;
  const viewer = createUser(store, {
    email: 'Ops@SunriseStays.example', name: 'Sunrise Ops', role: 'client', clientId, password: 'sunrise-pw-1',
  });
  assert.equal(viewer.email, 'ops@sunrisestays.example', 'emails normalize');
  assert.equal(viewer.clientId, clientId);

  assert.throws(() => createUser(store, { email: 'ops@sunrisestays.example', name: 'dup', role: 'client', clientId, password: 'whatever-pw' }), /already exists/);
  assert.throws(() => createUser(store, { email: 'x@y.co', name: 'x', role: 'client', password: 'whatever-pw' }), /clientId/);
  assert.throws(() => createUser(store, { email: 'x@y.co', name: 'x', role: 'client', clientId: 'cl_nope', password: 'whatever-pw' }), /unknown client/);

  assert.ok(verifyCredentials(store, 'ADMIN@revpilot.demo', 'revpilot-demo'));
  assert.equal(verifyCredentials(store, 'admin@revpilot.demo', 'nope-nope'), null);
  assert.equal(verifyCredentials(store, 'ghost@x.co', 'whatever-pw'), null);

  assert.ok(!JSON.stringify(toUserView(viewer)).includes('passwordHash'));
  assert.ok(store.getState().audit.some((e) => e.kind === 'user_added'));
});

test('sessions: web-crypto tokens round-trip, expire, and reject tampering', async () => {
  const user = { id: 'usr_00001', email: 'a@b.co', name: 'A', role: 'client' as const, clientId: 'cl_00001' };
  const now = 1_800_000_000;
  const token = await createSessionToken(user, 'secret-1', now, 3600);

  const claims = await verifySessionToken(token, 'secret-1', now + 10);
  assert.ok(claims);
  assert.equal(claims.role, 'client');
  assert.equal(claims.clientId, 'cl_00001');

  assert.equal(await verifySessionToken(token, 'secret-2', now + 10), null, 'wrong secret');
  assert.equal(await verifySessionToken(token, 'secret-1', now + 3601), null, 'expired');
  const [payload] = token.split('.');
  const forged = Buffer.from(JSON.stringify({ uid: 'usr_00001', email: 'a@b.co', name: 'A', role: 'admin', exp: now + 3600 })).toString('base64url');
  assert.equal(await verifySessionToken(`${forged}.${token.split('.')[1]}`, 'secret-1', now + 10), null, 'payload tamper');
  assert.equal(await verifySessionToken(`${payload}.AAAA`, 'secret-1', now + 10), null, 'sig tamper');
});
