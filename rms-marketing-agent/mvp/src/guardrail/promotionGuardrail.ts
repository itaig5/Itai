// Deterministic double-discount / clip-floor guard — BUILD THIS FIRST (docs 08, 09).
// Prevents the single costliest failure: OTA promos silently stacking below break-even.
// Stacking logic verified against Booking.com (multiplicative) and Airbnb (priority) rules.
import type { Channel } from '../types.ts';
import { round } from '../rms/signals.ts';

export interface GuardResult {
  channel: Channel;
  approved: boolean;
  effectiveDiscount: number; // 0..1, compounded/public-facing
  finalPrice: number;
  reason: string | null;
}

export interface GuardConfig {
  maxEffectiveDiscount?: number; // hard cap, default 0.35
  clipFloor?: number;            // absolute break-even price floor
  minVrboDiscount?: number;      // Vrbo needs >=5% to show the strikethrough badge
}

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
const GENIUS: Record<number, number> = { 0: 0, 1: 0.1, 2: 0.15, 3: 0.2 };

// ---- Booking.com: Genius x Targeting x Portfolio, all MULTIPLICATIVE ----
export interface BookingComStack {
  geniusTier: 0 | 1 | 2 | 3;
  mobileRate: boolean;       // ~10% targeting
  countryRate: boolean;      // ~5% targeting (does NOT stack with mobile — larger applies)
  portfolioDiscount: number; // single active Basic/Last-Minute/Early-Booker deal (0..1)
}

export function bookingComEffectiveDiscount(s: BookingComStack): number {
  const dGenius = GENIUS[s.geniusTier] ?? 0;
  const dTargeting = Math.max(s.mobileRate ? 0.1 : 0, s.countryRate ? 0.05 : 0);
  const dPortfolio = clamp01(s.portfolioDiscount);
  const remaining = (1 - dGenius) * (1 - dTargeting) * (1 - dPortfolio);
  return round(1 - remaining);
}

// ---- Airbnb: standard promos DON'T stack (largest applies); rule-set + non-refundable stack on top ----
export interface AirbnbStack {
  ruleSetDiscount: number;        // seasonal rule-set (stacks)
  nonRefundableDiscount: number;  // ~10% (stacks)
  activePromoDiscounts: number[]; // weekly/early-bird/last-minute/etc — only the LARGEST applies
}

export function airbnbEffectiveDiscount(s: AirbnbStack): number {
  const dPriority = s.activePromoDiscounts.length
    ? Math.max(...s.activePromoDiscounts.map(clamp01))
    : 0;
  const remaining =
    (1 - clamp01(s.ruleSetDiscount)) * (1 - dPriority) * (1 - clamp01(s.nonRefundableDiscount));
  return round(1 - remaining);
}

function decide(
  channel: Channel,
  effectiveDiscount: number,
  finalPrice: number,
  cfg: GuardConfig,
): GuardResult {
  const max = cfg.maxEffectiveDiscount ?? 0.35;
  let approved = effectiveDiscount <= max;
  let reason: string | null = approved
    ? null
    : `Compounded discount ${(effectiveDiscount * 100).toFixed(1)}% exceeds max ${(max * 100).toFixed(0)}%`;

  if (approved && cfg.clipFloor != null && finalPrice < cfg.clipFloor) {
    approved = false;
    reason = `Final price ${finalPrice} below clip floor ${cfg.clipFloor}`;
  }
  return { channel, approved, effectiveDiscount, finalPrice, reason };
}

export function validateBookingCom(basePrice: number, stack: BookingComStack, cfg: GuardConfig = {}): GuardResult {
  const eff = bookingComEffectiveDiscount(stack);
  return decide('booking', eff, round(basePrice * (1 - eff), 2), cfg);
}

export function validateAirbnb(basePrice: number, stack: AirbnbStack, cfg: GuardConfig = {}): GuardResult {
  const eff = airbnbEffectiveDiscount(stack);
  return decide('airbnb', eff, round(basePrice * (1 - eff), 2), cfg);
}

/** Vrbo needs >=5% for the merchandising badge; below that you cut price with no visibility gain. */
export function meetsVrboMerchandising(depthPct: number, min = 0.05): boolean {
  return depthPct >= min;
}
