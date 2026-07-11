'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Building2, KeyRound, Plug, Plus, Unplug } from 'lucide-react';
import { useApi, postJson, triggerRefresh } from '@/lib/useApi';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/input';
import { PageHeader, Skeleton, StatTile, EmptyState } from '@/components/ui/misc';
import { AddClientDialog } from '@/components/clients/add-client-dialog';
import { cn, fmtDate } from '@/lib/utils';
import type { ClientLoginResponse, ClientMutationResponse, ClientsResponse, ClientView } from '@/lib/apiTypes';

const STATUS_META: Record<ClientView['status'], { label: string; variant: 'good' | 'critical' | 'warning' | 'outline' }> = {
  connected: { label: 'connected', variant: 'good' },
  error: { label: 'connection error', variant: 'critical' },
  pending: { label: 'not connected', variant: 'warning' },
  disabled: { label: 'disconnected', variant: 'outline' },
};

const CM_LABEL: Record<ClientView['channelManager'], string> = {
  sheets: 'Google Sheets (guided)',
  demo: 'Demo portfolio',
  guesty: 'Guesty',
  hostaway: 'Hostaway',
};

export default function ClientsPage() {
  const { data, loading, error } = useApi<ClientsResponse>('/api/clients');
  const [showAdd, setShowAdd] = useState(false);

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-12 w-72" />
        <div className="grid grid-cols-3 gap-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (error || !data) return <p className="text-sm text-critical">Failed to load clients: {error}</p>;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Clients"
        description="The property-manager accounts RevPilot works for. Add a client, connect their channel manager, and their listings start feeding the brain."
        actions={
          <Button onClick={() => setShowAdd(true)}>
            <Plus size={14} /> Add client
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatTile label="Clients" value={String(data.clients.length)} sub={`${data.totals.connected} connected`} />
        <StatTile label="Listings under management" value={String(data.totals.listings)} sub="across all clients" />
        <StatTile
          label="Execution rail"
          value="Guesty-first"
          sub="the only CM API with OTA promotion management; demo mode needs no credentials"
        />
      </div>

      {data.clients.length === 0 ? (
        <EmptyState title="No clients yet" detail="Add your first client — demo mode gets them a full working portfolio with zero credentials." />
      ) : (
        data.clients.map((c) => <ClientCard key={c.id} client={c} />)
      )}

      <AddClientDialog open={showAdd} onClose={() => setShowAdd(false)} />
    </div>
  );
}

function ClientCard({ client }: { client: ClientView }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [login, setLogin] = useState<ClientLoginResponse | null>(null);
  const [resyncOpen, setResyncOpen] = useState(false);
  const [csv, setCsv] = useState('');
  const status = STATUS_META[client.status];
  const isSheets = client.channelManager === 'sheets';

  async function act(path: 'connect' | 'disconnect', body: Record<string, unknown> = {}) {
    setBusy(path);
    setActionError(null);
    try {
      await postJson<ClientMutationResponse>(`/api/clients/${client.id}/${path}`, body);
      setResyncOpen(false);
      setCsv('');
      triggerRefresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'failed');
    } finally {
      setBusy(null);
    }
  }

  async function createLogin() {
    setBusy('login');
    setActionError(null);
    try {
      setLogin(await postJson<ClientLoginResponse>(`/api/clients/${client.id}/login`, {}));
      triggerRefresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className={cn(client.status === 'disabled' && 'opacity-60')}>
      <CardHeader className="flex-row items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-inset text-ink-secondary">
          <Building2 size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">{client.name}</span>
            <Badge variant={status.variant}>{status.label}</Badge>
            <Badge variant="outline">{CM_LABEL[client.channelManager]}</Badge>
          </div>
          <div className="mt-0.5 text-[11px] text-ink-muted">
            {client.contactEmail} · {client.market} · added {fmtDate(client.createdAt)}
            {client.connectedAt ? ` · connected ${fmtDate(client.connectedAt)}` : ''}
            {client.credentialHint ? ` · creds ${client.credentialHint}` : ''}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          {client.status !== 'disabled' ? (
            <Button
              variant="secondary" size="sm" disabled={busy !== null}
              onClick={() => (isSheets ? setResyncOpen(true) : act('connect'))}
            >
              <Plug size={13} />
              {busy === 'connect' ? 'Connecting…' : client.status === 'connected' ? 'Sync now' : client.status === 'error' ? 'Retry connection' : 'Connect'}
            </Button>
          ) : null}
          {client.status === 'connected' ? (
            <>
              <Button variant="ghost" size="sm" onClick={createLogin} disabled={busy !== null} aria-label={`Create login for ${client.name}`}>
                <KeyRound size={13} /> {busy === 'login' ? 'Creating…' : 'Create login'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => act('disconnect')} disabled={busy !== null} aria-label={`Disconnect ${client.name}`}>
                <Unplug size={13} /> Disconnect
              </Button>
            </>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <p className={cn('text-xs', client.status === 'error' ? 'text-critical' : 'text-ink-muted')}>
          {client.statusDetail}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-ink-secondary">
          <span><strong className="text-ink">{client.listingCount}</strong> listings</span>
          <span><strong className="text-ink">{client.openRecs}</strong> recommendations waiting</span>
          <span><strong className="text-ink">{client.activePromos}</strong> promos live</span>
          {client.listingCount > 0 ? (
            <Link href="/" className="ml-auto inline-flex items-center gap-1 font-medium text-accent hover:underline">
              View portfolio <ArrowRight size={12} />
            </Link>
          ) : null}
        </div>
        {actionError ? <p className="mt-2 text-xs text-critical">{actionError}</p> : null}
      </CardContent>

      <Dialog
        open={resyncOpen}
        onClose={() => setResyncOpen(false)}
        title={`Sync ${client.name} from the weekly sheet`}
        description="Paste the fresh CSV export — the imported months replace the previous ones. Leave empty to re-run the last import."
        footer={
          <>
            <Button variant="ghost" onClick={() => setResyncOpen(false)} disabled={busy !== null}>Cancel</Button>
            <Button onClick={() => act('connect', csv.trim() ? { sheetsCsv: csv } : {})} disabled={busy !== null}>
              {busy === 'connect' ? 'Syncing…' : 'Sync'}
            </Button>
          </>
        }
      >
        <Textarea
          className="min-h-40 font-mono text-[11px]"
          placeholder="property,rooms,month,asOf,roomNights,income,occTarget,revenueTarget,expectedAdr,stlyRoomNights,stlyIncome"
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
        />
      </Dialog>

      <Dialog
        open={login !== null}
        onClose={() => setLogin(null)}
        title="Client login created"
        description="Copy these now — the password is shown once and only its hash is stored."
        footer={<Button onClick={() => setLogin(null)}>Done</Button>}
      >
        {login ? (
          <div className="flex flex-col gap-2 text-sm">
            <div className="rounded-lg bg-inset p-3 font-mono text-[13px]">
              <div>email: {login.email}</div>
              <div>password: {login.password}</div>
            </div>
            <p className="text-xs text-ink-muted">{login.note}</p>
          </div>
        ) : null}
      </Dialog>
    </Card>
  );
}
