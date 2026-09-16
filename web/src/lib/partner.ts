/**
 * Sourcing Partner channel — pure logic (EPIC N7, BACKLOG.md; business case in
 * PARTNER-PROGRAM.md).
 *
 * A partner drafts RFQs/quotes on behalf of a represented buyer or supplier
 * org, but never accepts one — that stays the principal's act alone
 * (lib/actions.ts's acceptQuoteAction is deliberately never touched by this
 * module or anything that imports it).
 *
 * REVENUE MODEL, same A1 boundary as lib/plans.ts: a partner is paid by
 * PharmaLink directly, never a cut of trade value. Model A (the only kind
 * this module computes) is a share of the SUBSCRIPTION revenue a partner
 * brought in — never a percentage of a Deal. See computePartnerPayoutAmount
 * and PartnerPayoutInput below: the input shape has no field derived from a
 * Deal/Quote, so nothing GMV-shaped can be plumbed through even by accident.
 *
 * Pure logic, no DB/Next imports — trivially unit-testable, same convention
 * as plans.ts/rbac.ts/contact-visibility.ts. NOTHING here may import
 * `node:*` — this module is imported by client components (e.g.
 * partner-onboarding-form.tsx for PARTNER_ARCHETYPES), and a single `node:`
 * import anywhere in the module fails the whole client bundle at build time,
 * not just at the call site. `generatePartnerCode` needs `node:crypto` and
 * lives in the server-only lib/partner-code.server.ts instead, for exactly
 * this reason.
 */

export const PARTNER_ARCHETYPES = [
  'indentor',
  'trading_company',
  'sourcing_consultant',
  'regulatory_consultant',
] as const;
export type PartnerArchetype = (typeof PARTNER_ARCHETYPES)[number];

export const PARTNER_TIERS = ['registered', 'qualified', 'specialist'] as const;
export type PartnerTier = (typeof PARTNER_TIERS)[number];

/**
 * The one badge class every tier gets, on every page that shows one.
 * Deliberately never `badge-verified`/`badge-neutral`/etc. — those are
 * reserved for actual ops-verification status (Organization.status), and a
 * tier is a business/subscription signal, unrelated to KYC. Badging
 * "specialist" as `badge-verified` would read as "KYC-verified" to a buyer,
 * which it isn't. One shared constant so the partner profile and search
 * pages can't drift into using different, inconsistent classes per tier.
 */
export const TIER_BADGE_CLASS = 'badge-violet';

/**
 * What a partner is allowed to do for one represented org. Comma-separated on
 * the PartnerRepresentation row, same small-fixed-vocabulary convention as
 * Organization.sourcingCategories etc. — read as a whole set, never queried
 * per-value.
 */
export const REPRESENTATION_SCOPES = [
  'rfq_draft',
  'quote_draft',
  'document_upload',
  'price_tier_manage',
] as const;
export type RepresentationScope = (typeof REPRESENTATION_SCOPES)[number];

export function hasScope(scopesCsv: string | null | undefined, scope: RepresentationScope): boolean {
  return (scopesCsv ?? '').split(',').includes(scope);
}

/**
 * Decides whether a partner may act for a principal org in a given scope,
 * given the PartnerRepresentation row (or null if none exists) fetched by the
 * caller. Pure decision — the DB lookup itself lives in partner-queries.ts.
 */
export function canActFor(
  representation: { revokedAt: Date | null; scopes: string } | null,
  scope: RepresentationScope
): boolean {
  if (!representation) return false;
  if (representation.revokedAt) return false;
  return hasScope(representation.scopes, scope);
}

/** True while a PartnerAttribution's Model A window (§3, 24 months) is still open. */
export function isAttributionActive(
  attribution: { expiresAt: Date } | null,
  now: Date
): boolean {
  if (!attribution) return false;
  return attribution.expiresAt.getTime() > now.getTime();
}

// ---------------------------------------------------------------------------
// Payouts — PharmaLink -> partner only. See the module header: this is the
// A1 boundary, enforced by the shape of PartnerPayoutInput, not just by
// policy.
// ---------------------------------------------------------------------------

/**
 * 'model_b_bounty' is added by N7.11 (P2) — no P1 code path may write it.
 * The four `*_bonus` kinds are PARTNER-INCENTIVES.md §3's rewards ladder
 * (activation/streak/breadth/referral) — the kind strings a future payout
 * write-path will use, added ahead of that write-path existing so the type
 * is ready. Nothing creates a PartnerPayout with one of these kinds yet;
 * getPartnerIncentives (partner-queries.ts) only READS the milestones they
 * describe, via INCENTIVE_MILESTONES below.
 */
export const PARTNER_PAYOUT_KINDS = ['model_a_margin', 'activation_bonus', 'streak_bonus', 'breadth_bonus', 'referral_bonus'] as const;
export type PartnerPayoutKind = (typeof PARTNER_PAYOUT_KINDS)[number];

/** 27.5% of the subscription price, for 24 months from attribution — PARTNER-PROGRAM.md §3, Model A. */
export const MODEL_A_MARGIN_RATE = 0.275;
export const MODEL_A_WINDOW_MONTHS = 24;

/**
 * Deliberately has NO dealId/quoteId/dealTotalValue/gmv field. A payout is
 * computed from a subscription invoice amount and a margin rate — nothing
 * else can be plumbed through, even by accident. See partner.test.ts.
 */
export interface PartnerPayoutInput {
  kind: PartnerPayoutKind;
  sourceInvoiceAmount: number;
  marginRate: number;
}

export function computePartnerPayoutAmount(input: PartnerPayoutInput): number {
  return Math.round(input.sourceInvoiceAmount * input.marginRate * 100) / 100;
}

// ---------------------------------------------------------------------------
// Rewards ladder (PARTNER-INCENTIVES.md §3) — read-only eligibility/progress,
// no payout write-path yet (see PARTNER_PAYOUT_KINDS' comment above). Every
// amount here is a fixed constant, never derived from a deal/quote/GMV
// figure — same A1 shape as Model A, just with nothing to compute since the
// reward doesn't scale with anything.
// ---------------------------------------------------------------------------

export const ACTIVATION_WINDOW_DAYS = 14;
export const STREAK_WINDOW_DAYS = 90;
export const STREAK_TARGET = 5;
export const BREADTH_TIERS = [3, 6, 10] as const;
export const REFERRAL_TARGET = 1;

/** USD, PARTNER-INCENTIVES.md §3's published amounts. */
export const INCENTIVE_REWARD_USD: Record<'activation_bonus' | 'streak_bonus' | 'breadth_bonus' | 'referral_bonus', number> = {
  activation_bonus: 100,
  streak_bonus: 150,
  breadth_bonus: 100, // per tier crossed
  referral_bonus: 75,
};

/** Whether `b` falls within `days` of `a` — the Activation milestone's 14-day window. */
export function withinDays(a: Date, b: Date, days: number): boolean {
  return Math.abs(b.getTime() - a.getTime()) <= days * 24 * 60 * 60 * 1000;
}

/** How many of BREADTH_TIERS a given represented-org count has reached. */
export function breadthTiersReached(count: number): number {
  return BREADTH_TIERS.filter((t) => count >= t).length;
}
