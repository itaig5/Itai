// The marketing-action policy: findings -> candidate promo arms -> (bandit picks) -> a
// cross-channel Recommendation with guided actions. Rules anchor the choice set (explainable,
// legal: own-data triggers only); the contextual bandit refines type+depth from outcomes.
import type {
  BanditChoice, Channel, Finding, GuidedAction, ListingRecord, MoveType,
  OperatorSettings, Platform, PromoMove, Recommendation, Signals, VisibilitySignals,
} from '../types.ts';
import { depthForDeficit, recommendMove } from './rules.ts';
import { round } from './signals.ts';
import { meetsVrboMerchandising } from '../guardrail/promotionGuardrail.ts';

export interface CandidateSpec {
  types: MoveType[];
  anchorDepth: number; // the rules-ladder depth the bandit explores around
}

/** Which arms the bandit may choose from, per finding. Null = fixed move, no learning. */
export function candidateSpecFor(finding: Finding, s: Signals): CandidateSpec | null {
  switch (finding.signal) {
    case 'soft_demand_overpriced':
    case 'soft_demand': {
      const types: MoveType[] = ['last_minute', 'basic_deal'];
      if (s.leadTimeDays >= 21) types.push('early_booker'); // long booking window -> early-booker viable
      return { types, anchorDepth: depthForDeficit(s.paceVsStlyPct) };
    }
    case 'visibility_drop':
      return { types: ['last_minute', 'basic_deal'], anchorDepth: Math.max(depthForDeficit(s.paceVsStlyPct), 0.1) };
    case 'orphan_gap':
      return { types: ['basic_deal', 'weekly_los'], anchorDepth: 0.2 };
    default:
      return null; // ahead_of_pace / healthy / new_listing: deterministic move
  }
}

/** Overlay the bandit's chosen arm onto the rules move (Vrbo 5% floor preserved).
 *  The rationale is REWRITTEN, not appended: every number it quotes must trace to a
 *  signal or to the final move, or the verifier's grounding check rejects it. */
export function applyBanditArm(move: PromoMove, choice: BanditChoice): PromoMove {
  let depth = choice.arm.depthPct;
  if (move.channel === 'vrbo' && !meetsVrboMerchandising(depth)) depth = 0.05;
  const cut = move.rationale.lastIndexOf(' -> ');
  const stem = cut >= 0 ? move.rationale.slice(0, cut) : move.rationale;
  const label = choice.arm.type.replace(/_/g, '-');
  return {
    ...move,
    type: choice.arm.type,
    depthPct: round(depth),
    rationale: `${stem} -> run a ${(depth * 100).toFixed(0)}% ${label} deal (${choice.explore ? 'policy exploring' : 'policy best-known arm'}, ${choice.model}).`,
  };
}

const PROGRAM_LINKS: Record<Platform, { title: string; url: string; steps: string[] }> = {
  booking: {
    title: 'Enroll in Booking.com Visibility Booster / Genius',
    url: 'https://admin.booking.com/', // extranet-only program (doc 11) — guided, never scraped
    steps: [
      'Log in to the Booking.com extranet',
      'Open Opportunities -> Visibility Booster (or Genius under Growth)',
      'Set the boost window to the soft dates from this recommendation',
      'Confirm the commission uplift and activate',
      'Check the Visibility Dashboard in ~48h and enter the new rank in RevPilot',
    ],
  },
  airbnb: {
    title: 'Improve Airbnb search placement (program + quality levers)',
    url: 'https://www.airbnb.com/hosting/insights',
    steps: [
      'Open Hosting -> Insights and review the conversion funnel',
      'Turn on Instant Book if off (rank factor)',
      'Respond to all pending inquiries (<1h response time is a rank factor)',
      'Work toward Guest Favorite / Superhost thresholds shown in Insights',
    ],
  },
  expedia: {
    title: 'Enroll in Expedia Accelerator',
    url: 'https://partnercentral.expediagroup.com/',
    steps: [
      'Log in to Expedia Partner Central',
      'Open Marketing -> Accelerator',
      'Set an accelerator % for the soft window from this recommendation',
      'Track Visibility Performance after 3-5 days and record it in RevPilot',
    ],
  },
  vrbo: {
    title: 'Work toward Vrbo Premier Host / boost placement',
    url: 'https://www.vrbo.com/pa/',
    steps: [
      'Open the Vrbo partner dashboard',
      'Review Premier Host criteria (acceptance rate, cancellations, reviews)',
      'Ensure the promotion depth is >=5% so the strikethrough badge shows',
    ],
  },
};

/** Doc 12 §2: on a visibility drop -> ① native promo (auto) ② program enrollment (guided)
 *  ③ content/quality fixes (flag). ①  is the PromoMove; this builds ② and ③. */
export function guidedActionsFor(visibility: VisibilitySignals[]): GuidedAction[] {
  const actions: GuidedAction[] = [];
  for (const v of visibility) {
    if (!v.dropDetected) continue;
    const link = PROGRAM_LINKS[v.platform];
    actions.push({ kind: 'program_enrollment', platform: v.platform, ...link });
    if (v.reviewScore != null && v.reviewScore < 8) {
      actions.push({
        kind: 'content_fix',
        platform: v.platform,
        title: `Lift review score on ${v.platform} (currently ${v.reviewScore.toFixed(1)}/10 — a rank factor)`,
        url: link.url,
        steps: [
          'Reply to every recent review (response rate is a quality signal)',
          'Refresh the first 5 photos and the headline',
          'Fix the top recurring complaint from recent reviews',
        ],
      });
    }
  }
  return actions;
}

export interface CrossChannelRecInput {
  recommendationId: string;
  signals: Signals;
  finding: Finding;
  move: PromoMove;                  // rules move, possibly bandit-overlaid already
  banditChoice?: BanditChoice;
  listing: ListingRecord;
  settings: OperatorSettings;
  asOf: string;
}

/** The connected platforms this listing's promo should push to — "approve once, every channel". */
export function targetChannelsFor(listing: ListingRecord, settings: OperatorSettings): Channel[] {
  return listing.channels.filter((c): c is Platform => c !== 'direct')
    .filter((c) => settings.channels[c]?.connected);
}

export function assembleRecommendation(inp: CrossChannelRecInput): Recommendation {
  const { signals, finding, move } = inp;
  const isPromo = move.type !== 'none' && move.type !== 'remove_discounts';
  return {
    recommendationId: inp.recommendationId,
    listingId: signals.listingId,
    window: signals.window,
    move,
    finding,
    confidence: finding.confidence,
    requiresHumanApproval: true, // advisory-only; auto mode still enforces operator-set bounds
    risk: isPromo
      ? 'Discount depth affects margin — the guardrail simulates stacked discounts per channel before any write.'
      : 'Low.',
    createdAt: inp.asOf,
    targetChannels: isPromo || move.type === 'remove_discounts' ? targetChannelsFor(inp.listing, inp.settings) : [],
    guidedActions: guidedActionsFor(signals.visibility ?? []),
    banditChoice: inp.banditChoice,
    status: 'proposed',
  };
}
