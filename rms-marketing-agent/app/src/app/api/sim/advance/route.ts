import { NextResponse } from 'next/server';
import { advanceDay } from '@revpilot/core';
import { requireAdmin } from '@/lib/server/session';
import { getRuntime } from '@/lib/server/runtime';
import type { SimAdvanceResponse } from '@/lib/apiTypes';

export const dynamic = 'force-dynamic';

/** "Advance one day": the daily snapshot job + demand sim + outcome measurement + nightly
 *  learning, fast-forwarded — so the operator can WATCH the loop close on seed data. */
export async function POST(req: Request) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const rt = await getRuntime();
  const summary = await advanceDay(rt);
  const body: SimAdvanceResponse = { ...summary, simDate: summary.date };
  return NextResponse.json(body);
}
