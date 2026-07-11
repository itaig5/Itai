// Composition root: env flags decide mock-vs-live for every port. With NO env set the whole
// app runs on the seeded demo world (JSON-file persisted); creds flip individual ports live.
import { loadEnv, type RevPilotEnv } from './config/env.ts';
import { JsonFileStore } from './store/jsonFileStore.ts';
import { MemoryStore, type Store } from './store/store.ts';
import { PostgresStore } from './store/postgresStore.ts';
import { createPostgresExecutor } from './store/sql.ts';
import { ensureAdminUser } from './auth/users.ts';
import { generateWorld, DEFAULT_SEED } from './sample/world.ts';
import { MockChannelAdapter } from './adapters/mockAdapter.ts';
import { createGuestyAdapter } from './adapters/guestyAdapter.ts';
import type { ChannelAdapter } from './adapters/channelAdapter.ts';
import {
  CompositeVisibilityProvider, type VisibilityAdapter, type VisibilityProviderPort,
} from './visibility/provider.ts';
import { StoreBackedOperatorInputAdapter } from './visibility/operatorInput.ts';
import { StoreBackedPublicRankAdapter } from './visibility/publicRank.ts';
import { BookingMarketInsightsAdapter, StoreBackedMarketInsightsAdapter } from './visibility/bookingMarketInsights.ts';
import { StoreBackedReviewsAdapter } from './visibility/reviews.ts';
import { BanditClient } from './learning/banditClient.ts';
import { ForecastClient } from './learning/forecastClient.ts';
import type { Runtime } from './engine/engine.ts';

export interface RuntimeOptions {
  env?: RevPilotEnv;
  /** in-memory store (tests); default is the JSON-file dev store */
  ephemeral?: boolean;
  seed?: number;
}

export function createRuntime(opts: RuntimeOptions = {}): Runtime {
  const env = opts.env ?? loadEnv();
  const seed = opts.seed ?? DEFAULT_SEED;

  const store: Store = opts.ephemeral
    ? new MemoryStore(generateWorld({ seed }))
    : JsonFileStore.load(env.dataFile, () => generateWorld({ seed }));

  return finishRuntime(env, store, seed);
}

/** Async variant: required when DATABASE_URL is set (Postgres/Supabase persistence).
 *  Falls back to the sync JSON/memory path when it isn't. */
export async function createRuntimeAsync(opts: RuntimeOptions = {}): Promise<Runtime> {
  const env = opts.env ?? loadEnv();
  const seed = opts.seed ?? DEFAULT_SEED;
  if (!env.databaseUrl || opts.ephemeral) return createRuntime(opts);
  const executor = await createPostgresExecutor(env.databaseUrl);
  const store = await PostgresStore.load(executor, () => generateWorld({ seed }));
  return finishRuntime(env, store, seed);
}

function finishRuntime(env: RevPilotEnv, store: Store, seed: number): Runtime {
  // migrate dev-state files written before client accounts existed
  if (!store.getState().clients) {
    store.update((s) => {
      s.clients = [{
        id: 'cl_00001',
        name: 'Sunrise Stays (demo)',
        contactEmail: 'ops@sunrisestays.example',
        market: 'Mixed EU/US',
        channelManager: 'demo',
        status: 'connected',
        statusDetail: `${s.listings.length} listings imported from the demo portfolio`,
        listingIds: s.listings.map((l) => l.id),
        createdAt: s.simDate,
        connectedAt: s.simDate,
      }];
      s.counters.cl = Math.max(s.counters.cl ?? 0, 1);
      for (const l of s.listings) l.clientId = l.clientId ?? 'cl_00001';
    });
  }

  // seed/migrate console users: there is always an admin (env-overridable credentials)
  ensureAdminUser(store, { email: env.adminEmail, password: env.adminPassword });

  // Live Guesty only with explicit env opt-in; the demo world uses the mock adapter.
  const adapter: ChannelAdapter = env.guestyEnabled
    ? createGuestyAdapter(env)
    : new MockChannelAdapter(store);

  const visibilityAdapters: VisibilityAdapter[] = [
    new StoreBackedPublicRankAdapter(store),
    new StoreBackedOperatorInputAdapter(store),
    new StoreBackedReviewsAdapter(store),
    env.bookingInsightsEnabled
      ? new BookingMarketInsightsAdapter(env)
      : new StoreBackedMarketInsightsAdapter(store),
  ];
  const visibility: VisibilityProviderPort = new CompositeVisibilityProvider(visibilityAdapters);

  return {
    env,
    store,
    adapter,
    visibility,
    bandit: new BanditClient(store, env),
    forecast: new ForecastClient(env),
  };
}

/** Reset the demo world (the dashboard's "Reset demo" button). */
export function resetWorld(rt: Runtime, seed: number = DEFAULT_SEED): void {
  rt.store.setState(generateWorld({ seed }));
}
