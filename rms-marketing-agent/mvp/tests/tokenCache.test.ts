import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GuestyTokenManager, InMemoryTokenStore } from '../src/adapters/tokenCache.ts';

test('caches the token and refreshes only near expiry (protects the 5/24h budget)', async () => {
  let now = 0;
  let fetches = 0;
  const store = new InMemoryTokenStore();
  const mgr = new GuestyTokenManager(
    store,
    async () => { fetches++; return { token: `t${fetches}`, ttlMs: 24 * 60 * 60 * 1000 }; },
    { now: () => now, refreshSkewMs: 15 * 60 * 1000 },
  );

  assert.equal(await mgr.getToken(), 't1'); // first fetch
  now += 60 * 60 * 1000;                     // +1h
  assert.equal(await mgr.getToken(), 't1'); // still cached, no new fetch
  assert.equal(fetches, 1);

  now += 23 * 60 * 60 * 1000;                // ~24h in, inside the refresh skew
  assert.equal(await mgr.getToken(), 't2'); // refreshed
  assert.equal(fetches, 2);
});
