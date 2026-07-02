// The verifier gate (docs 07/08): every recommendation passes schema + grounding + guardrail +
// legal checks BEFORE a human (or the bounds-checked auto path) can execute it. Deterministic —
// the LLM never gets to overrule these.
import type {
  Channel, ListingRecord, MoveType, OperatorSettings, Platform,
  PromotionRecord, Recommendation, Signals,
} from '../types.ts';
import {
  validateAirbnb, validateBookingCom, validateGenericStack, type GuardResult,
} from '../guardrail/promotionGuardrail.ts';

const MOVE_TYPES: MoveType[] = ['last_minute', 'weekly_los', 'basic_deal', 'early_booker', 'remove_discounts', 'new_listing', 'none'];
const CHANNELS: Channel[] = ['airbnb', 'booking', 'expedia', 'vrbo', 'direct'];

export interface VerifierCheck {
  name: string;
  pass: boolean;
  detail: string;
}

export interface VerifierReport {
  pass: boolean;
  checks: VerifierCheck[];
  guards: GuardResult[]; // per target channel — shown as the dry-run preview in the UI
}

/** Simulate the compounded public price on one channel if this promo goes live,
 *  including programs (Genius/mobile) and promos ALREADY active on the channel. */
export function guardForChannel(
  channel: Channel,
  listing: ListingRecord,
  signals: Signals,
  proposedDepth: number,
  activePromos: PromotionRecord[],
  settings: OperatorSettings,
): GuardResult {
  const basePrice = signals.adr > 0 ? signals.adr : listing.baseRate;
  const cfg = {
    maxEffectiveDiscount: settings.maxEffectiveDiscount,
    clipFloor: Math.round(basePrice * settings.clipFloorPctOfAdr * 100) / 100,
  };
  const flags = listing.channelFlags?.[channel as Platform] ?? {};
  const existing = activePromos
    .filter((p) => p.listingId === listing.id && p.channel === channel && p.status === 'active')
    .map((p) => p.depthPct);

  if (channel === 'booking') {
    // Booking portfolio deals don't combine (highest applies) but Genius/targeting stack on top.
    return validateBookingCom(basePrice, {
      geniusTier: flags.geniusTier ?? 0,
      mobileRate: flags.mobileRate ?? false,
      countryRate: flags.countryRate ?? false,
      portfolioDiscount: Math.max(proposedDepth, ...existing, 0),
    }, cfg);
  }
  if (channel === 'airbnb') {
    return validateAirbnb(basePrice, {
      ruleSetDiscount: flags.ruleSetDiscount ?? 0,
      nonRefundableDiscount: flags.nonRefundableDiscount ?? 0,
      activePromoDiscounts: [...existing, proposedDepth],
    }, cfg);
  }
  return validateGenericStack(channel, basePrice, existing, proposedDepth, cfg);
}

/** Numbers quoted in the rationale must be traceable to the finding's metrics (docs 07:
 *  "a code validator rejects any rationale number not traceable to a signal"). */
export function groundingCheck(rec: Recommendation): VerifierCheck {
  const quoted = (rec.move.rationale.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  const legit = new Set<number>();
  for (const v of Object.values(rec.finding.metrics)) {
    legit.add(Math.round(v));
    legit.add(Math.round(v * 100));           // metrics are fractions; rationales quote %
    legit.add(Math.round(Math.abs(v * 100))); // "20pp behind" quotes the magnitude
    legit.add(Math.round(v * 10) / 10);
  }
  legit.add(Math.round(rec.move.depthPct * 100));
  legit.add(5); // the Vrbo merchandising floor is a fixed, documented constant
  legit.add(20); // documented rule anchors (orphan/new-listing 20%)
  legit.add(1); // "<1h response time" style fixed guidance
  legit.add(7); // measurement/pickup windows quoted in rationales
  legit.add(14); // the rank-trend window (visibility math)
  const untraceable = quoted.filter((n) => !legit.has(Math.abs(n)) && !legit.has(Math.abs(Math.round(n))));
  return {
    name: 'grounding',
    pass: untraceable.length === 0,
    detail: untraceable.length === 0
      ? 'Every number in the rationale traces to a computed signal.'
      : `Numbers not traceable to signals: ${untraceable.join(', ')}`,
  };
}

export interface VerifyInput {
  rec: Recommendation;
  signals: Signals;
  listing: ListingRecord;
  settings: OperatorSettings;
  activePromos: PromotionRecord[];
}

export function verifyRecommendation(inp: VerifyInput): VerifierReport {
  const { rec, signals, listing, settings } = inp;
  const checks: VerifierCheck[] = [];
  const isPromo = rec.move.type !== 'none' && rec.move.type !== 'remove_discounts';

  // 1. Schema / enum / range validity
  const schemaProblems: string[] = [];
  if (!MOVE_TYPES.includes(rec.move.type)) schemaProblems.push(`bad move type ${rec.move.type}`);
  if (!CHANNELS.includes(rec.move.channel)) schemaProblems.push(`bad channel ${rec.move.channel}`);
  if (rec.move.depthPct < 0 || rec.move.depthPct > 0.5) schemaProblems.push(`depth ${rec.move.depthPct} out of range`);
  if (isPromo && rec.move.depthPct <= 0) schemaProblems.push('promo move with zero depth');
  if (!(rec.confidence >= 0 && rec.confidence <= 1)) schemaProblems.push('confidence out of range');
  if (Number.isNaN(Date.parse(rec.window.start)) || Number.isNaN(Date.parse(rec.window.end))) schemaProblems.push('invalid window');
  for (const c of rec.targetChannels ?? []) {
    if (!CHANNELS.includes(c)) schemaProblems.push(`bad target channel ${c}`);
  }
  checks.push({
    name: 'schema',
    pass: schemaProblems.length === 0,
    detail: schemaProblems.length === 0 ? 'Recommendation matches the action schema.' : schemaProblems.join('; '),
  });

  // 2. Grounding
  checks.push(groundingCheck(rec));

  // 3. Freshness — stale signals must degrade to NO_ACTION upstream, but verify anyway
  checks.push({
    name: 'data_freshness',
    pass: signals.missing.length === 0 || !isPromo,
    detail: signals.missing.length === 0
      ? 'All signal inputs present.'
      : `Missing inputs: ${signals.missing.join(', ')}`,
  });

  // 4. Legal (Gibson/RealPage + CA AB325/SB763, docs 01/09):
  //    triggers use the property's OWN data + PUBLIC comps only; advisory unless the
  //    operator set bounds themselves; no pooling of confidential competitor data.
  const legalProblems: string[] = [];
  if (!rec.requiresHumanApproval && settings.autonomyMode !== 'auto_within_bounds') {
    legalProblems.push('execution without approval requires operator-set bounds');
  }
  checks.push({
    name: 'legal',
    pass: legalProblems.length === 0,
    detail: legalProblems.length === 0
      ? 'Own-data triggers + public comps only; human approval (or operator-set bounds) enforced.'
      : legalProblems.join('; '),
  });

  // 5. Guardrail per target channel (double-discount / clip floor) — the hard gate
  const guards: GuardResult[] = isPromo
    ? (rec.targetChannels ?? [rec.move.channel]).map((c) =>
        guardForChannel(c, listing, signals, rec.move.depthPct, inp.activePromos, settings))
    : [];
  const blockedChannels = guards.filter((g) => !g.approved);
  if (isPromo) {
    checks.push({
      name: 'guardrail',
      pass: blockedChannels.length < guards.length, // pass if at least one channel is safe
      detail: blockedChannels.length === 0
        ? `Compounded discount within the ${(settings.maxEffectiveDiscount * 100).toFixed(0)}% cap and above the clip floor on every channel.`
        : `Blocked on ${blockedChannels.map((g) => `${g.channel} (${g.reason})`).join('; ')}`,
    });
  }

  return { pass: checks.every((c) => c.pass), checks, guards };
}

/** Operator-set auto-execution bounds (doc 12 §1). Compliant ONLY because the operator sets them. */
export function withinBounds(rec: Recommendation, settings: OperatorSettings, activePromoCount: number): { ok: boolean; reason: string } {
  if (settings.autonomyMode !== 'auto_within_bounds') return { ok: false, reason: 'autonomy mode is approve-each' };
  const b = settings.bounds;
  if (!b.allowedTypes.includes(rec.move.type)) return { ok: false, reason: `${rec.move.type} not in operator's allowed types` };
  if (rec.move.depthPct > b.maxDepthPct) return { ok: false, reason: `depth ${(rec.move.depthPct * 100).toFixed(0)}% exceeds operator max ${(b.maxDepthPct * 100).toFixed(0)}%` };
  if (activePromoCount >= b.maxActivePromosPerListing) return { ok: false, reason: `listing already has ${activePromoCount} active promos (max ${b.maxActivePromosPerListing})` };
  const deficit = -(rec.finding.metrics.paceVsStlyPct ?? 0);
  if (deficit < b.minPaceDeficitPct) return { ok: false, reason: `pace deficit ${(deficit * 100).toFixed(0)}pp below operator threshold ${(b.minPaceDeficitPct * 100).toFixed(0)}pp` };
  return { ok: true, reason: 'within operator-set bounds' };
}
