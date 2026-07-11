// Signed session tokens on PURE Web Crypto (globalThis.crypto.subtle) — the same code runs
// in Node route handlers, Next edge middleware, and tests. Format:
//   base64url(claimsJson) + '.' + base64url(hmacSha256(claims, secret))
// Claims carry role + clientId so the edge can enforce isolation without a store lookup.
import type { UserRecord, UserRole } from '../types.ts';

export interface SessionClaims {
  uid: string;
  email: string;
  name: string;
  role: UserRole;
  clientId?: string;
  exp: number; // epoch seconds
}

const enc = new TextEncoder();

function toB64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function hmac(payload: string, secret: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(payload)));
}

export async function createSessionToken(
  user: Pick<UserRecord, 'id' | 'email' | 'name' | 'role' | 'clientId'>,
  secret: string,
  nowEpochSeconds: number,
  ttlSeconds = 7 * 24 * 3600,
): Promise<string> {
  const claims: SessionClaims = {
    uid: user.id, email: user.email, name: user.name, role: user.role,
    ...(user.clientId ? { clientId: user.clientId } : {}),
    exp: nowEpochSeconds + ttlSeconds,
  };
  const payload = toB64url(enc.encode(JSON.stringify(claims)));
  const sig = toB64url(await hmac(payload, secret));
  return `${payload}.${sig}`;
}

export async function verifySessionToken(
  token: string,
  secret: string,
  nowEpochSeconds: number,
): Promise<SessionClaims | null> {
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = toB64url(await hmac(payload, secret));
  if (sig.length !== expected.length) return null;
  // constant-time-ish compare (both are locally computed digests, so timing leakage is moot,
  // but don't hand reviewers a footgun)
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return null;
  try {
    const claims = JSON.parse(new TextDecoder().decode(fromB64url(payload))) as SessionClaims;
    if (!claims.uid || !claims.role || typeof claims.exp !== 'number') return null;
    if (claims.exp <= nowEpochSeconds) return null;
    return claims;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE = 'revpilot_session';
