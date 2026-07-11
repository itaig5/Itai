import { NextResponse } from 'next/server';
import { getRuntime } from '@/lib/server/runtime';
import { clientIdFrom, inScope, scopedListingIds } from '@/lib/server/clientScope';
import type { LearningResponse } from '@/lib/apiTypes';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const rt = getRuntime();
  const state = rt.store.getState();
  const scope = scopedListingIds(state, clientIdFrom(req));
  const names = new Map(state.listings.map((l) => [l.id, l.name]));

  const banditView = await rt.bandit.stateView();

  let mlService: LearningResponse['mlService'] = { up: false, url: rt.env.mlServiceUrl };
  try {
    const res = await fetch(`${rt.env.mlServiceUrl}/health`, { signal: AbortSignal.timeout(800) });
    if (res.ok) {
      const health = await res.json();
      let models: unknown;
      try {
        const m = await fetch(`${rt.env.mlServiceUrl}/models`, { signal: AbortSignal.timeout(800) });
        if (m.ok) models = await m.json();
      } catch { /* registry optional */ }
      mlService = { up: true, url: rt.env.mlServiceUrl, backends: health.backends, models };
    }
  } catch { /* dashboard runs fine on the TS fallback */ }

  const scopedOutcomes = state.outcomes.filter((o) => inScope(scope, o.listingId));
  const measured = scopedOutcomes.filter((o) => o.status === 'measured');
  const body: LearningResponse = {
    simDate: state.simDate,
    outcomes: [...scopedOutcomes]
      .sort((a, b) => b.executedAt.localeCompare(a.executedAt))
      .map((o) => ({ ...o, listingName: names.get(o.listingId) ?? o.listingId })),
    bandit: {
      model: banditView.model,
      local: banditView.local,
      remote: banditView.remote,
    },
    mlService,
    measuredCount: measured.length,
    avgReward: measured.length
      ? measured.reduce((a, o) => a + (o.reward ?? 0), 0) / measured.length
      : null,
  };
  return NextResponse.json(body);
}
