// Session resolution + role gates for route handlers. With auth OFF (the frictionless demo
// default) every request acts as the admin; with REVPILOT_AUTH=local the signed cookie
// decides, and client-role users are read-only + locked to their own client's listings.
import { SESSION_COOKIE, verifySessionToken, type SessionClaims } from '@revpilot/core';
import { getRuntime } from './runtime';

export async function getSession(req: Request): Promise<SessionClaims | null> {
  const rt = await getRuntime();
  if (rt.env.authMode !== 'local') return null;
  const cookie = req.headers.get('cookie') ?? '';
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  if (!match) return null;
  return verifySessionToken(decodeURIComponent(match[1]), rt.env.authSecret, Math.floor(Date.now() / 1000));
}

/** Mutations are admin-only when auth is on. Returns a ready error Response, or null to proceed. */
export async function requireAdmin(req: Request): Promise<Response | null> {
  const rt = await getRuntime();
  if (rt.env.authMode !== 'local') return null;
  const session = await getSession(req);
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (session.role !== 'admin') {
    return Response.json({ error: 'client logins are read-only — ask your operator to approve actions' }, { status: 403 });
  }
  return null;
}

/** client-role sessions are hard-locked to their own client, whatever the query says. */
export async function forcedClientId(req: Request): Promise<string | null> {
  const session = await getSession(req);
  return session?.role === 'client' ? (session.clientId ?? null) : null;
}
