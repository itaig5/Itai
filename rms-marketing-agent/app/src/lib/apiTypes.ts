// Shared request/response DTOs between route handlers and client components.
// Client components import ONLY types from here (the core runs server-side).
import type {
  AuditEvent, Channel, ClientChannelManager, ClientStatus, ClientView, DaySummary,
  HitlHandle, OperatorSettings, OutcomeRecord, PromotionRecord, Recommendation,
  Signals, VerifierReport, VisibilitySignals,
} from '@revpilot/core';

export type {
  AuditEvent, Channel, ClientChannelManager, ClientStatus, ClientView, DaySummary,
  HitlHandle, OperatorSettings, OutcomeRecord, PromotionRecord, Recommendation,
  Signals, VerifierReport, VisibilitySignals,
};

export interface ClientsResponse {
  simDate: string;
  clients: ClientView[];
  totals: { connected: number; listings: number };
}

export interface AddClientRequest {
  name: string;
  contactEmail: string;
  market: string;
  channelManager: ClientChannelManager;
  credentials?: { clientId?: string; clientSecret?: string };
  demoListingCount?: number;
  /** create + immediately attempt the connection (the default UI flow) */
  connectNow?: boolean;
}

export interface ClientMutationResponse {
  client: ClientView;
  connect?: { status: ClientStatus; detail: string; importedListingIds: string[] };
}

export interface SeriesPointDto {
  ds: string;
  [key: string]: string | number | null;
}

export interface ListingKpiDto {
  id: string;
  name: string;
  market: string;
  bedrooms: number;
  imageHue: number;
  channels: Channel[];
  occupancy: number;
  targetOccupancy: number;
  paceVsStlyPct: number;
  pickup7d: number;
  adr: number;
  revpan: number;
  compGapPct: number;
  activePromos: number;
  openRecs: number;
  visibilityDrop: boolean;
  paceSeries: { ds: string; otb: number }[];
}

export interface PortfolioResponse {
  simDate: string;
  totals: {
    occupancy: number;
    paceVsStlyPct: number;
    revpan: number;
    adr: number;
    activePromos: number;
    openRecs: number;
    pendingOutcomes: number;
  };
  listings: ListingKpiDto[];
  otbSeries: { ds: string; occupancy: number }[];
  channelMix: { channel: Channel; nights: number }[];
}

export interface RecCardDto {
  rec: Recommendation;
  report: VerifierReport;
  listingName: string;
  market: string;
  imageHue: number;
  metrics: {
    occupancy: number;
    targetOccupancy: number;
    paceVsStlyPct: number;
    compGapPct: number;
    pickup7d: number;
    visibilityDrops: number;
  };
}

export interface RecommendationsResponse {
  simDate: string;
  items: RecCardDto[];
}

export interface PushResultDto {
  recommendationId: string;
  dryRun: boolean;
  executedChannels: Channel[];
  blockedChannels: Channel[];
  outcomeId: string | null;
  results: {
    channel: Channel;
    approved: boolean;
    effectiveDiscount: number;
    finalPrice: number;
    reason: string | null;
    status: string;
    ref?: string;
  }[];
}

export interface RadarRowDto extends PromotionRecord {
  listingName: string;
}

export interface RadarResponse {
  simDate: string;
  channels: Channel[];
  listings: { id: string; name: string; imageHue: number }[];
  active: RadarRowDto[];
  ended: RadarRowDto[];
}

export interface VisibilityPlatformDto {
  platform: Exclude<Channel, 'direct'>;
  signals: VisibilitySignals;
  rankSeries: { ds: string; rank: number }[];
  impressionsSeries: { ds: string; impressions: number }[];
}

export interface VisibilityListingDto {
  listingId: string;
  name: string;
  market: string;
  imageHue: number;
  platforms: VisibilityPlatformDto[];
  openVisibilityRec: Recommendation | null;
}

export interface VisibilityResponse {
  simDate: string;
  listings: VisibilityListingDto[];
}

export interface BanditRowDto {
  bucket: string;
  armId: string;
  alpha: number;
  beta: number;
  pulls: number;
  mean: number;
}

export interface LearningResponse {
  simDate: string;
  outcomes: (OutcomeRecord & { listingName: string })[];
  bandit: { model: string; local: BanditRowDto[]; remote: unknown | null };
  mlService: { up: boolean; url: string; backends?: Record<string, unknown>; models?: unknown };
  measuredCount: number;
  avgReward: number | null;
}

export interface AuditResponse {
  simDate: string;
  events: (AuditEvent & { listingName?: string })[];
}

export interface SimAdvanceResponse extends DaySummary {
  simDate: string;
}
