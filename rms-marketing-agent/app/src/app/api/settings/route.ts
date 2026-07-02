import { NextResponse } from 'next/server';
import type { OperatorSettings } from '@revpilot/core';
import { getRuntime } from '@/lib/server/runtime';

export const dynamic = 'force-dynamic';

export async function GET() {
  const rt = getRuntime();
  const state = rt.store.getState();
  return NextResponse.json({
    simDate: state.simDate,
    settings: state.settings,
    integrations: {
      guesty: rt.env.guestyEnabled ? 'live' : 'mock (set GUESTY_ENABLED + credentials)',
      hostaway: rt.env.hostawayEnabled ? 'live' : 'off (set HOSTAWAY_ENABLED + credentials)',
      bookingInsights: rt.env.bookingInsightsEnabled ? 'live' : 'sample data (set BOOKING_INSIGHTS_ENABLED)',
      mlService: rt.env.mlServiceUrl,
    },
  });
}

export async function PUT(req: Request) {
  const rt = getRuntime();
  const state = rt.store.getState();
  const next = (await req.json().catch(() => null)) as OperatorSettings | null;
  if (!next || !next.autonomyMode || !next.bounds) {
    return NextResponse.json({ error: 'invalid settings payload' }, { status: 400 });
  }
  // guardrail caps stay inside sane hard limits no matter what the UI sends
  next.maxEffectiveDiscount = Math.min(Math.max(next.maxEffectiveDiscount, 0.1), 0.6);
  next.clipFloorPctOfAdr = Math.min(Math.max(next.clipFloorPctOfAdr, 0.2), 0.9);
  next.bounds.maxDepthPct = Math.min(Math.max(next.bounds.maxDepthPct, 0.05), 0.3);

  rt.store.setSettings(next);
  rt.store.appendAudit({
    ts: state.simDate, actor: 'operator', kind: 'settings_changed',
    detail: `Settings updated: autonomy=${next.autonomyMode}, cap=${(next.maxEffectiveDiscount * 100).toFixed(0)}%, auto-off=${next.autoTurnOffEnabled ? 'on' : 'off'}, bounds(maxDepth=${(next.bounds.maxDepthPct * 100).toFixed(0)}%, maxActive=${next.bounds.maxActivePromosPerListing}, minDeficit=${(next.bounds.minPaceDeficitPct * 100).toFixed(0)}pp)`,
    payload: next,
  });
  return NextResponse.json({ ok: true, settings: next });
}
