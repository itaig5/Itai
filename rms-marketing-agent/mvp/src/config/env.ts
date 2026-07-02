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

    dataFile: env.REVPILOT_DATA_FILE ?? '.data/revpilot-state.json',
  };
}
