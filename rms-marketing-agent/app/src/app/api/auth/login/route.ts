import { NextResponse } from 'next/server';
import { createSessionToken, SESSION_COOKIE, verifyCredentials, toUserView } from '@revpilot/core';
import { getRuntime } from '@/lib/server/runtime';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const rt = await getRuntime();
  if (rt.env.authMode !== 'local') {
    return NextResponse.json({ error: 'auth is disabled (set REVPILOT_AUTH=local)' }, { status: 400 });
  }
  const { email, password } = await req.json().catch(() => ({}));
  if (!email || !password) return NextResponse.json({ error: 'email and password required' }, { status: 400 });

  const user = verifyCredentials(rt.store, email, password);
  if (!user) return NextResponse.json({ error: 'wrong email or password' }, { status: 401 });

  const token = await createSessionToken(user, rt.env.authSecret, Math.floor(Date.now() / 1000));
  const res = NextResponse.json({ ok: true, user: toUserView(user) });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 7 * 24 * 3600,
  });
  return res;
}
