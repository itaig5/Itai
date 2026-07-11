// Per-client scoping for the read APIs: ?clientId=cl_00001 narrows every view to that
// client's listings. This is view-level filtering for the operator console — true tenant
// isolation (auth, per-client settings) is the Supabase/auth milestone.
import type { RevPilotState } from '@revpilot/core';

export function clientIdFrom(req: Request): string | null {
  const v = new URL(req.url).searchParams.get('clientId');
  return v && v !== 'all' ? v : null;
}

/** null = no filter (all clients). */
export function scopedListingIds(state: RevPilotState, clientId: string | null): Set<string> | null {
  if (!clientId) return null;
  return new Set(state.listings.filter((l) => l.clientId === clientId).map((l) => l.id));
}

export function inScope(scope: Set<string> | null, listingId: string | undefined): boolean {
  if (!scope) return true;
  return listingId != null && scope.has(listingId);
}
