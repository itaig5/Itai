import { NextResponse } from 'next/server';
import { createUser, generatePassword } from '@revpilot/core';
import { getRuntime } from '@/lib/server/runtime';
import { requireAdmin } from '@/lib/server/session';

export const dynamic = 'force-dynamic';

/** Issue a read-only console login for a client. The password is returned ONCE and never stored
 *  in plaintext — regenerating means issuing a new login. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { id } = await params;
  const rt = await getRuntime();
  const client = rt.store.getState().clients.find((c) => c.id === id);
  if (!client) return NextResponse.json({ error: 'unknown client' }, { status: 404 });

  const { email } = await req.json().catch(() => ({}));
  const loginEmail = (email as string | undefined)?.trim() || client.contactEmail;
  const password = generatePassword();
  try {
    const user = createUser(rt.store, {
      email: loginEmail,
      name: client.name,
      role: 'client',
      clientId: client.id,
      password,
    });
    return NextResponse.json({
      email: user.email,
      password, // shown once in the dialog; only the scrypt hash is stored
      note: rt.env.authMode === 'local'
        ? 'Share these credentials with the client — they see only their own portfolio, read-only.'
        : 'Login created. NOTE: auth is currently OFF (set REVPILOT_AUTH=local to enforce logins).',
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'failed to create login' }, { status: 400 });
  }
}
