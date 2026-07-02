import { NextResponse } from 'next/server';
import { resetWorld } from '@revpilot/core';
import { getRuntime, resetRuntimeCaches } from '@/lib/server/runtime';

export const dynamic = 'force-dynamic';

export async function POST() {
  const rt = getRuntime();
  resetWorld(rt);
  resetRuntimeCaches();
  // best-effort: clear the ML service's bandit state too, so demo resets are total
  try {
    await fetch(`${rt.env.mlServiceUrl}/bandit/reset`, { method: 'POST', signal: AbortSignal.timeout(800) });
  } catch { /* service optional */ }
  return NextResponse.json({ ok: true, simDate: rt.store.getState().simDate });
}
