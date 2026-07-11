// Central env-flag configuration. The WHOLE app runs on seed data with no env set;
// every live integration is opt-in via these flags (BUILD_PROMPT: "credential-ready via env vars").

export interface RevPilotEnv {
  // Guesty (the only CM whose public API exposes OTA promotion management)
  guestyEnabled: boolean;
  guestyClientId: string | null;
  guestyClientSecret: string | null;
  guestyBaseUrl: string;

  // Hostaway (second CM: rates/calendar only — NO promotion API, docs 09)
  hostawayEnabled: boolean;
  hostawayAccountId: string | null;
  hostawayApiKey: string | null;
  hostawayBaseUrl: string;

  // Booking.com Market Insights (gated connectivity API: demand/pace, NOT the funnel)
  bookingInsightsEnabled: boolean;
  bookingInsightsToken: string | null;

  // ML microservice (Python/FastAPI). When unreachable, the TS fallback bandit runs in-process.
  mlServiceUrl: string;

  // Nixtla TimeGPT for zero-shot forecast cold-start (used by the ML service)
  nixtlaApiKey: string | null;

  // Optional LLM explainer (the LLM explains — it never computes numbers)
  anthropicApiKey: string | null;

  // Where the JSON dev store persists (seed-data mode)
  dataFile: string;

  // Postgres/Supabase persistence: set to the TRANSACTION-POOLER url (port 6543) on serverless
  databaseUrl: string | null;

  // Console auth: 'off' (frictionless demo, default) | 'local' (email+password, signed cookies)
  authMode: 'off' | 'local';
  authSecret: string;
  adminEmail: string;
  adminPassword: string;
}

export function loadEnv(env: NodeJS.ProcessEnv = process.env): RevPilotEnv {
  return {
    guestyEnabled: env.GUESTY_ENABLED === 'true',
    guestyClientId: env.GUESTY_CLIENT_ID ?? null,
    guestyClientSecret: env.GUESTY_CLIENT_SECRET ?? null,
    guestyBaseUrl: env.GUESTY_BASE_URL ?? 'https://open-api.guesty.com/v1',

    hostawayEnabled: env.HOSTAWAY_ENABLED === 'true',
    hostawayAccountId: env.HOSTAWAY_ACCOUNT_ID ?? null,
    hostawayApiKey: env.HOSTAWAY_API_KEY ?? null,
    hostawayBaseUrl: env.HOSTAWAY_BASE_URL ?? 'https://api.hostaway.com/v1',

    bookingInsightsEnabled: env.BOOKING_INSIGHTS_ENABLED === 'true',
    bookingInsightsToken: env.BOOKING_INSIGHTS_TOKEN ?? null,

    mlServiceUrl: env.ML_SERVICE_URL ?? 'http://localhost:8787',
    nixtlaApiKey: env.NIXTLA_API_KEY ?? null,
    anthropicApiKey: env.ANTHROPIC_API_KEY ?? null,

    // serverless (Vercel/Lambda) filesystems are read-only outside /tmp — the demo store
    // must live there (ephemeral by design; production persistence is the Postgres port)
    dataFile: env.REVPILOT_DATA_FILE ?? (env.VERCEL ? '/tmp/revpilot-state.json' : '.data/revpilot-state.json'),

    databaseUrl: env.DATABASE_URL ?? null,

    authMode: env.REVPILOT_AUTH === 'local' ? 'local' : 'off',
    // dev fallback secret keeps the demo one-command; production MUST set its own
    authSecret: env.REVPILOT_AUTH_SECRET ?? 'revpilot-dev-secret-change-me',
    adminEmail: env.REVPILOT_ADMIN_EMAIL ?? 'admin@revpilot.demo',
    adminPassword: env.REVPILOT_ADMIN_PASSWORD ?? 'revpilot-demo',
  };
}
