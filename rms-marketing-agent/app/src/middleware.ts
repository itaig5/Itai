// Auth gate (edge runtime). Only active with REVPILOT_AUTH=local — the default demo stays
// one-command. Token verification is pure Web Crypto (core/auth/session), so it runs on the
// edge without the store; role/scope enforcement happens again server-side in the handlers.
import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '@revpilot/core/auth/session.ts';

const PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/auth/me', '/healthz'];

export async function middleware(req: NextRequest) {
  if (process.env.REVPILOT_AUTH !== 'local') return NextResponse.next();
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p)) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const secret = process.env.REVPILOT_AUTH_SECRET ?? 'revpilot-dev-secret-change-me';
  const claims = token
    ? await verifySessionToken(token, secret, Math.floor(Date.now() / 1000))
    : null;
  if (claims) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  if (pathname !== '/') url.searchParams.set('next', pathname);
  return NextResponse.redirect(url);
}

export const config = {
  // everything except Next internals and static assets
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
