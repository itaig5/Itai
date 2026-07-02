// Server-side singleton runtime. Survives Next dev hot-reloads via globalThis; state itself
// is persisted by the core's JsonFileStore (app/.data/revpilot-state.json).
import { createRuntime, HitlRunner, type Runtime } from '@revpilot/core';

const g = globalThis as unknown as {
  __revpilotRuntime?: Runtime;
  __revpilotHitl?: HitlRunner;
};

export function getRuntime(): Runtime {
  if (!g.__revpilotRuntime) {
    g.__revpilotRuntime = createRuntime();
  }
  return g.__revpilotRuntime;
}

export function getHitlRunner(): HitlRunner {
  if (!g.__revpilotHitl) {
    g.__revpilotHitl = new HitlRunner(getRuntime());
  }
  return g.__revpilotHitl;
}

/** After a reset, drop the cached runner (its run map points at the old world). */
export function resetRuntimeCaches(): void {
  g.__revpilotHitl = undefined;
}
