'use client';

import { useApi } from '@/lib/useApi';
import { PageHeader, EmptyState, Skeleton } from '@/components/ui/misc';
import { RecCard } from '@/components/recommendations/rec-card';
import { WorkflowRunner } from '@/components/recommendations/workflow-runner';
import type { RecommendationsResponse } from '@/lib/apiTypes';

export default function RecommendationsPage() {
  const { data, loading, error } = useApi<RecommendationsResponse>('/api/recommendations');

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-12 w-72" />
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-72" />)}
      </div>
    );
  }
  if (error || !data) return <p className="text-sm text-critical">Failed to load recommendations: {error}</p>;

  const listings = [...new Map(data.items.map((i) => [i.rec.listingId, { id: i.rec.listingId, name: i.listingName }])).values()];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Recommendations"
        description="Each card shows the why — grounded only in the listing's own computed numbers. Approve once; RevPilot pushes to every connected channel simultaneously."
        actions={listings.length > 0 ? <WorkflowRunner listings={listings} /> : undefined}
      />
      {data.items.length === 0 ? (
        <EmptyState
          title="Nothing to review — the portfolio is pacing to plan"
          detail="Advance the demo clock a day or two; when a listing falls behind pace or drops in search rank, the engine queues a recommendation here."
        />
      ) : (
        data.items.map((item) => <RecCard key={item.rec.recommendationId} item={item} />)
      )}
    </div>
  );
}
