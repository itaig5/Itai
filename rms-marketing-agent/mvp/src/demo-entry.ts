// Browser bundle entry for the publishable live demo. Exposes the REAL engine — same signal
// math, rules+bandit policy, guardrail, orchestrator, simulator — with the browser-safe ports
// only (MemoryStore + mock adapter; no fs, no Mastra, no network).
export { generateWorld, generateClientListings, DEFAULT_SEED } from './sample/world.ts';
export { MemoryStore, DEFAULT_SETTINGS } from './store/store.ts';
export { MockChannelAdapter } from './adapters/mockAdapter.ts';
export { CompositeVisibilityProvider } from './visibility/provider.ts';
export { StoreBackedPublicRankAdapter } from './visibility/publicRank.ts';
export { StoreBackedOperatorInputAdapter } from './visibility/operatorInput.ts';
export { StoreBackedReviewsAdapter } from './visibility/reviews.ts';
export { StoreBackedMarketInsightsAdapter } from './visibility/bookingMarketInsights.ts';
export { BanditClient } from './learning/banditClient.ts';
export { ForecastClient } from './learning/forecastClient.ts';
export { banditStateView } from './learning/tsBandit.ts';
export { loadEnv } from './config/env.ts';
export {
  generateRecommendations, openRecommendations, approveAndPush, rejectRecommendation,
  buildSignals, buildAllSignals,
} from './engine/engine.ts';
export { advanceDay } from './sample/simulator.ts';
export { addClient, connectClient, toClientView } from './clients/clientService.ts';
