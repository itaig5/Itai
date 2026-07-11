'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CalendarClock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { useApi, postJson } from '@/lib/useApi';

interface MeResponse {
  authMode: 'off' | 'local';
  defaultAdminCredentials: boolean;
}

function LoginForm() {
  const params = useSearchParams();
  const { data: me } = useApi<MeResponse>('/api/auth/me');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await postJson('/api/auth/login', { email, password });
      window.location.href = params.get('next') ?? '/';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'login failed');
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-page p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-accent-ink">
            <CalendarClock size={20} />
          </div>
          <div>
            <div className="text-lg font-semibold tracking-tight">RevPilot</div>
            <div className="text-[11px] leading-tight text-ink-muted">revenue · every channel</div>
          </div>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-4 rounded-card border border-hairline bg-card p-6 shadow-sm">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" className="mt-1" value={email}
              onChange={(e) => setEmail(e.target.value)} autoFocus />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" autoComplete="current-password" className="mt-1" value={password}
              onChange={(e) => setPassword(e.target.value)} />
          </div>
          {error ? <p className="text-xs text-critical">{error}</p> : null}
          <Button type="submit" disabled={busy || !email || !password}>
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
          {me?.defaultAdminCredentials ? (
            <p className="rounded-lg bg-inset px-3 py-2 text-[11px] leading-relaxed text-ink-muted">
              Demo credentials in effect: <code>admin@revpilot.demo</code> / <code>revpilot-demo</code>.
              Set <code>REVPILOT_ADMIN_EMAIL</code> / <code>REVPILOT_ADMIN_PASSWORD</code> before real use.
            </p>
          ) : null}
        </form>
        <p className="mt-4 text-center text-[11px] text-ink-muted">
          Client logins are read-only and see only their own portfolio.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
