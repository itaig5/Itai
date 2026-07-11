// Server-side singleton runtime. Survives Next dev hot-reloads via globalThis. Persistence
// is chosen by env: DATABASE_URL -> Postgres/Supabase; otherwise the JSON dev store.
import { createRuntimeAsync, HitlRunner, type Runtime } from '@revpilot/core';

const g = globalThis as unknown as {
  __revpilotRuntime?: Promise<Runtime>;
  __revpilotHitl?: HitlRunner;
};

export function getRuntime(): Promise<Runtime> {
  if (!g.__revpilotRuntime) {
    g.__revpilotRuntime = createRuntimeAsync();
  }
  return g.__revpilotRuntime;
}

export async function getHitlRunner(): Promise<HitlRunner> {
  if (!g.__revpilotHitl) {
    g.__revpilotHitl = new HitlRunner(await getRuntime());
  }
  return g.__revpilotHitl;
}

/** After a reset, drop the cached runner (its run map points at the old world). */
export function resetRuntimeCaches(): void {
  g.__revpilotHitl = undefined;
}
