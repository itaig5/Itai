// The adapter interface every channel manager / direct OTA implements.
// Lets the engine start on Guesty and expand (Hostaway, Cloudbeds, direct) without touching the core.
import type { Channel, PromoMove } from '../types.ts';

export interface Listing {
  id: string;
  name: string;
  channels: Channel[];
}

export interface JobResult {
  ok: boolean;
  ref?: string;
  message?: string;
}

export interface GuidedStep {
  url: string;      // deep link into the extranet/dashboard
  steps: string[];  // checklist for the operator
}

export interface ChannelAdapter {
  id: string;
  capabilities: {
    pushRates: boolean;
    pushAvailability: boolean;
    listOtaPromotions: boolean;
    executeOtaPromotions: 'api' | 'guided' | 'none';
    promotionTargets: Channel[];
  };

  // Reads
  getListings(): Promise<Listing[]>;
  getActivePromotions(listingId: string): Promise<PromoMove[]>;

  // Writes (auto-execute) — optional; present only where the channel exposes it
  assignPromotion?(listingId: string, move: PromoMove, idempotencyKey: string): Promise<JobResult>;
  unassignPromotion?(listingId: string, promotionId: string): Promise<JobResult>;

  // Guided-execute fallback where no API exists (Genius, Visibility Booster, Accelerator...)
  buildGuidedStep?(move: PromoMove): GuidedStep;
}
