'use client';

import { useState } from 'react';
import { FastForward, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/shell/theme';
import { useApi, postJson, triggerRefresh } from '@/lib/useApi';
import { fmtDate } from '@/lib/utils';
import type { SimAdvanceResponse } from '@/lib/apiTypes';

export function TopBar() {
  const { data } = useApi<{ simDate: string }>('/api/settings');
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

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
        <Button variant="secondary" size="sm" onClick={advance} disabled={busy !== null}>
          <FastForward size={14} />
          {busy === 'advance' ? 'Simulating…' : 'Advance 1 day'}
        </Button>
        <Button variant="ghost" size="sm" onClick={reset} disabled={busy !== null} aria-label="Reset demo data">
          <RotateCcw size={14} />
          Reset demo
        </Button>
        <ThemeToggle />
      </div>
    </header>
  );
}
