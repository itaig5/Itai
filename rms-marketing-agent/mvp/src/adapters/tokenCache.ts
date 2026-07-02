// Guesty caps token requests at 5 per 24h (docs 09). Requesting a token per call = production lockout.
// This manager caches the token and only refreshes near expiry. Swap InMemoryTokenStore for Redis in prod.

export interface CachedToken {
  token: string;
  expiresAt: number; // epoch ms
}

export interface TokenStore {
  get(key: string): Promise<CachedToken | null>;
  set(key: string, value: CachedToken): Promise<void>;
}

export class InMemoryTokenStore implements TokenStore {
  private m = new Map<string, CachedToken>();
  async get(key: string): Promise<CachedToken | null> {
    return this.m.get(key) ?? null;
  }
  async set(key: string, value: CachedToken): Promise<void> {
    this.m.set(key, value);
  }
}

export interface TokenManagerOpts {
  key?: string;
  refreshSkewMs?: number;      // refresh this long before expiry (default 15 min)
  now?: () => number;          // injectable clock for testing
}

export class GuestyTokenManager {
  private store: TokenStore;
  private fetchToken: () => Promise<{ token: string; ttlMs: number }>;
  private opts: TokenManagerOpts;

  constructor(
    store: TokenStore,
    fetchToken: () => Promise<{ token: string; ttlMs: number }>,
    opts: TokenManagerOpts = {},
  ) {
    this.store = store;
    this.fetchToken = fetchToken;
    this.opts = opts;
  }

  async getToken(): Promise<string> {
    const key = this.opts.key ?? 'guesty';
    const now = (this.opts.now ?? Date.now)();
    const skew = this.opts.refreshSkewMs ?? 15 * 60 * 1000;

    const cached = await this.store.get(key);
    if (cached && cached.expiresAt - now > skew) {
      return cached.token; // still fresh — no network call, protects the 5/24h budget
    }
    const { token, ttlMs } = await this.fetchToken();
    await this.store.set(key, { token, expiresAt: now + ttlMs });
    return token;
  }
}
