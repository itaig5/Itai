'use client';

import { useEffect, useState } from 'react';
import { FastForward, LogOut, RotateCcw, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { ThemeToggle } from '@/components/shell/theme';
import { useApi, postJson, triggerRefresh, getClientFilter, setClientFilter } from '@/lib/useApi';
import { fmtDate } from '@/lib/utils';
import type { ClientsResponse, MeResponse, SimAdvanceResponse } from '@/lib/apiTypes';

function ClientSwitcher() {
  const { data } = useApi<ClientsResponse>('/api/clients');
  const [selected, setSelected] = useState<string>('all');
  useEffect(() => { setSelected(getClientFilter() ?? 'all'); }, []);
  if (!data || data.clients.length <= 1) return null;
  return (
    <Select
      aria-label="Filter dashboard by client"
      className="h-8 max-w-44 text-xs"
      value={selected}
      onChange={(e) => {
        setSelected(e.target.value);
        setClientFilter(e.target.value === 'all' ? null : e.target.value);
      }}
    >
      <option value="all">All clients</option>
      {data.clients.map((c) => (
        <option key={c.id} value={c.id}>{c.name}</option>
      ))}
    </Select>
  );
}

export function TopBar() {
  const { data } = useApi<{ simDate: string }>('/api/settings');
  const { data: me } = useApi<MeResponse>('/api/auth/me');
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const isClientRole = me?.user?.role === 'client';

  async function signOut() {
    await postJson('/api/auth/logout');
    window.location.href = '/login';
  }

  async function advance() {
    setBusy('advance');
    try {
      const r = await postJson<SimAdvanceResponse>('/api/sim/advance');
      setToast(
        `${fmtDate(r.simDate)}: +${r.newBookings} bookings (${r.bookedNights} nights) · ${r.outcomesMeasured.length} outcome(s) measured · ${r.banditUpdates} bandit update(s) · ${r.promosEnded.length} promo(s) auto-ended`,
      );
      triggerRefresh();
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'advance failed');
    } finally {
      setBusy(null);
      setTimeout(() => setToast(null), 6000);
    }
  }

  async function reset() {
    setBusy('reset');
    try {
      await postJson('/api/sim/reset');
      setToast('Demo world reset to day one.');
      triggerRefresh();
    } finally {
      setBusy(null);
      setTimeout(() => setToast(null), 4000);
    }
  }

  return (
    <header className="sticky top-0 z-40 border-b border-hairline bg-page/90 backdrop-blur">
      <div className="flex h-14 items-center gap-3 px-6">
        {!isClientRole ? <ClientSwitcher /> : null}
        <div className="text-xs text-ink-muted">
          Portfolio day
          <span className="ml-2 rounded-md bg-inset px-2 py-1 font-medium text-ink">
            {data ? fmtDate(data.simDate) : '…'}
          </span>
        </div>
        {toast ? (
          <div className="min-w-0 flex-1 truncate rounded-md bg-accent-soft px-3 py-1.5 text-xs text-ink" role="status">
            {toast}
          </div>
        ) : (
          <div className="flex-1" />
        )}
        {!isClientRole ? (
          <>
            <Button variant="secondary" size="sm" onClick={advance} disabled={busy !== null}>
              <FastForward size={14} />
              {busy === 'advance' ? 'Simulating…' : 'Advance 1 day'}
            </Button>
            <Button variant="ghost" size="sm" onClick={reset} disabled={busy !== null} aria-label="Reset demo data">
              <RotateCcw size={14} />
              Reset demo
            </Button>
          </>
        ) : null}
        {me?.authMode === 'local' && me.user ? (
          <span className="flex items-center gap-1.5 rounded-full border border-hairline px-2.5 py-1 text-[11px] text-ink-secondary">
            <UserRound size={12} className="text-ink-muted" />
            {me.user.email}
            <button onClick={signOut} aria-label="Sign out" className="ml-1 cursor-pointer text-ink-muted hover:text-ink">
              <LogOut size={12} />
            </button>
          </span>
        ) : null}
        <ThemeToggle />
      </div>
    </header>
  );
}
