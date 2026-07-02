import * as React from 'react';
import { cn } from '@/lib/utils';

export function Separator({ className }: { className?: string }) {
  return <div className={cn('h-px w-full bg-hairline', className)} />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-inset', className)} />;
}

/** Stat tile (dataviz spec): label · value · optional signed delta vs a named period. */
export function StatTile({
  label, value, delta, deltaGoodWhenUp = true, sub, children,
}: {
  label: string;
  value: string;
  delta?: { value: number; text: string };
  deltaGoodWhenUp?: boolean;
  sub?: string;
  children?: React.ReactNode; // optional sparkline
}) {
  const good = delta ? (delta.value >= 0) === deltaGoodWhenUp : true;
  return (
    <div className="rounded-card border border-hairline bg-card p-4">
      <div className="text-xs text-ink-muted">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tracking-tight">{value}</span>
        {delta ? (
          <span className={cn('text-xs font-medium', good ? 'text-[var(--delta-up-good)]' : 'text-critical')}>
            {delta.value >= 0 ? '▲' : '▼'} {delta.text}
          </span>
        ) : null}
      </div>
      {sub ? <div className="mt-0.5 text-[11px] text-ink-muted">{sub}</div> : null}
      {children}
    </div>
  );
}

export function EmptyState({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-hairline bg-card p-10 text-center">
      <p className="text-sm font-medium text-ink-secondary">{title}</p>
      {detail ? <p className="mt-1 max-w-md text-xs text-ink-muted">{detail}</p> : null}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-ink-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
