import { NextResponse } from 'next/server';
import { getRuntime } from '@/lib/server/runtime';
import { getSession } from '@/lib/server/session';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const rt = await getRuntime();
  const session = rt.env.authMode === 'local' ? await getSession(req) : null;
  return NextResponse.json({
    authMode: rt.env.authMode,
    user: session
      ? { email: session.email, name: session.name, role: session.role, clientId: session.clientId ?? null }
      : null,
    // login-page hint: only while the seeded demo credentials are still in effect
    defaultAdminCredentials: rt.env.authMode === 'local' && rt.env.adminPassword === 'revpilot-demo',
  });
}
