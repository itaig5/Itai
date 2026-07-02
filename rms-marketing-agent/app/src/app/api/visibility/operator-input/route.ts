import { NextResponse } from 'next/server';
import { parseOperatorVisibilityCsv, buildManualEntry } from '@revpilot/core';
import { getRuntime } from '@/lib/server/runtime';

export const dynamic = 'force-dynamic';

/** Human-in-the-loop visibility ingestion (doc 11): the operator reads the extranet
 *  dashboards and uploads a CSV or a single manual entry — we NEVER scrape logged-in extranets. */
export async function POST(req: Request) {
  const rt = getRuntime();
  const state = rt.store.getState();
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });

  let added = 0;
  if (typeof body.csv === 'string') {
    for (const obs of parseOperatorVisibilityCsv(body.csv)) {
      rt.store.addVisibilityObservation(obs);
      added++;
    }
  } else if (body.entry) {
    const e = body.entry;
    if (!e.listingId || !e.platform) {
      return NextResponse.json({ error: 'entry needs listingId and platform' }, { status: 400 });
    }
    rt.store.addVisibilityObservation(buildManualEntry({ ...e, observedAt: e.observedAt ?? state.simDate }));
    added = 1;
  } else {
    return NextResponse.json({ error: 'send {csv} or {entry}' }, { status: 400 });
  }

  if (added > 0) {
    rt.store.appendAudit({
      ts: state.simDate, actor: 'operator', kind: 'settings_changed',
      detail: `Operator entered ${added} visibility metric row(s) from the extranet dashboards`,
    });
  }
  return NextResponse.json({ ok: true, added });
}
