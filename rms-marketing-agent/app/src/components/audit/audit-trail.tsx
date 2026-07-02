'use client';

import { useMemo, useState } from 'react';
import {
  Ban, BrainCircuit, Camera, CheckCircle2, Eye, FlaskConical, Rocket, Settings2,
  ShieldX, Sparkles, ThumbsDown, Timer, Wrench,
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/input';
import { CHANNEL_COLOR, fmtDate } from '@/lib/utils';
import type { AuditResponse } from '@/lib/apiTypes';

const KIND_META: Record<string, { icon: React.ComponentType<{ size?: number | string; className?: string }>; variant: 'good' | 'accent' | 'critical' | 'warning' | 'outline' | 'default' }> = {
  executed: { icon: Rocket, variant: 'good' },
  auto_executed: { icon: Rocket, variant: 'good' },
  approved: { icon: CheckCircle2, variant: 'accent' },
  dry_run: { icon: FlaskConical, variant: 'accent' },
  recommendation_created: { icon: Sparkles, variant: 'accent' },
  verifier_pass: { icon: CheckCircle2, variant: 'outline' },
  verifier_block: { icon: ShieldX, variant: 'critical' },
  guardrail_block: { icon: ShieldX, variant: 'critical' },
  rejected: { icon: ThumbsDown, variant: 'critical' },
  visibility_drop: { icon: Eye, variant: 'warning' },
  outcome_measured: { icon: Timer, variant: 'accent' },
  bandit_update: { icon: BrainCircuit, variant: 'accent' },
  learning_job: { icon: BrainCircuit, variant: 'outline' },
  promo_ended: { icon: Ban, variant: 'default' },
  settings_changed: { icon: Settings2, variant: 'outline' },
  snapshot: { icon: Camera, variant: 'outline' },
  guided_step: { icon: Wrench, variant: 'warning' },
};

export function AuditTrail({ data }: { data: AuditResponse }) {
  const [kind, setKind] = useState('all');
  const [listing, setListing] = useState('all');

  const kinds = useMemo(() => [...new Set(data.events.map((e) => e.kind))].sort(), [data.events]);
  const listings = useMemo(
    () => [...new Set(data.events.map((e) => e.listingName).filter((n): n is string => !!n))].sort(),
    [data.events],
  );
  const filtered = data.events.filter(
    (e) => (kind === 'all' || e.kind === kind) && (listing === 'all' || e.listingName === listing),
  );

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2">
        <Select aria-label="Filter by event kind" className="h-8 text-xs" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="all">All events</option>
          {kinds.map((k) => <option key={k} value={k}>{k.replace(/_/g, ' ')}</option>)}
        </Select>
        <Select aria-label="Filter by listing" className="h-8 text-xs" value={listing} onChange={(e) => setListing(e.target.value)}>
          <option value="all">All listings</option>
          {listings.map((l) => <option key={l} value={l}>{l}</option>)}
        </Select>
        <span className="ml-auto text-[11px] text-ink-muted">{filtered.length} of {data.events.length} events</span>
      </CardHeader>
      <CardContent className="p-0">
        <div className="flex flex-col">
          {filtered.map((e) => {
            const meta = KIND_META[e.kind] ?? { icon: Camera, variant: 'outline' as const };
            const Icon = meta.icon;
            return (
              <div key={e.id} className="flex items-start gap-3 border-b border-hairline px-5 py-2.5 last:border-0 hover:bg-inset/40">
                <Badge variant={meta.variant} className="mt-0.5 shrink-0">
                  <Icon size={11} /> {e.kind.replace(/_/g, ' ')}
                </Badge>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] leading-snug text-ink">{e.detail}</p>
                  <p className="mt-0.5 text-[11px] text-ink-muted">
                    {fmtDate(e.ts)} · {e.actor}
                    {e.listingName ? <> · {e.listingName}</> : null}
                    {e.channel ? (
                      <>
                        {' · '}
                        <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: CHANNEL_COLOR[e.channel] }} /> {e.channel}
                      </>
                    ) : null}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
        <p className="px-5 py-3 text-[11px] text-ink-muted">
          Append-only — nothing here can be edited or deleted. In production this table carries the
          approver, token, exact payload, and result for every write (7-year retention).
        </p>
      </CardContent>
    </Card>
  );
}
