'use client';

import { useMemo, useState } from 'react';
import { useApi } from '@/lib/useApi';
import { Button } from '@/components/ui/button';
import { PageHeader, Skeleton } from '@/components/ui/misc';
import { AuditTrail } from '@/components/audit/audit-trail';
import { OutcomesPanel } from '@/components/audit/outcomes-panel';
import type { AuditResponse, LearningResponse } from '@/lib/apiTypes';

export default function AuditPage() {
  const [view, setView] = useState<'audit' | 'learning'>('audit');
  const audit = useApi<AuditResponse>('/api/audit?limit=250');
  const learning = useApi<LearningResponse>('/api/learning');

  const loading = view === 'audit' ? audit.loading : learning.loading;
  const error = view === 'audit' ? audit.error : learning.error;

  const header = useMemo(() => (
    <PageHeader
      title="Audit & Outcomes"
      description="The immutable record: every recommendation, approval, push, block, and measured result — and what the learning engine did with it."
      actions={
        <div className="flex gap-1 rounded-lg border border-hairline bg-card p-1">
          <Button size="sm" variant={view === 'audit' ? 'default' : 'ghost'} onClick={() => setView('audit')}>
            Audit trail
          </Button>
          <Button size="sm" variant={view === 'learning' ? 'default' : 'ghost'} onClick={() => setView('learning')}>
            Outcomes &amp; learning
          </Button>
        </div>
      }
    />
  ), [view]);

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        {header}
        <Skeleton className="h-24" />
        <Skeleton className="h-96" />
      </div>
    );
  }
  if (error) return <div>{header}<p className="text-sm text-critical">Failed to load: {error}</p></div>;

  return (
    <div className="flex flex-col gap-4">
      {header}
      {view === 'audit' && audit.data ? <AuditTrail data={audit.data} /> : null}
      {view === 'learning' && learning.data ? <OutcomesPanel data={learning.data} /> : null}
    </div>
  );
}
