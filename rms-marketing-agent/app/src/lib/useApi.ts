'use client';

import { useCallback, useEffect, useState } from 'react';

/** Fired after world-changing actions (advance day, reset, approve...) so every
 *  mounted screen refetches — the whole dashboard stays one consistent world. */
export const REFRESH_EVENT = 'revpilot:refresh';

export function triggerRefresh() {
  window.dispatchEvent(new Event(REFRESH_EVENT));
}

/** The operator's client filter (the topbar switcher). Applied to every GET. */
const CLIENT_FILTER_KEY = 'revpilot-client-filter';

export function getClientFilter(): string | null {
  const v = localStorage.getItem(CLIENT_FILTER_KEY);
  return v && v !== 'all' ? v : null;
}

export function setClientFilter(clientId: string | null) {
  if (clientId) localStorage.setItem(CLIENT_FILTER_KEY, clientId);
  else localStorage.removeItem(CLIENT_FILTER_KEY);
  triggerRefresh();
}

function withClientFilter(path: string): string {
  const clientId = getClientFilter();
  if (!clientId) return path;
  return `${path}${path.includes('?') ? '&' : '?'}clientId=${encodeURIComponent(clientId)}`;
}

export function useApi<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(withClientFilter(path), { cache: 'no-store' });
      if (!res.ok) throw new Error(`${res.status} ${await res.text().catch(() => '')}`);
      setData((await res.json()) as T);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'request failed');
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    refresh();
    window.addEventListener(REFRESH_EVENT, refresh);
    return () => window.removeEventListener(REFRESH_EVENT, refresh);
  }, [refresh]);

  return { data, loading, error, refresh };
}

export async function postJson<T = unknown>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error ?? `${res.status}`);
  return json as T;
}
