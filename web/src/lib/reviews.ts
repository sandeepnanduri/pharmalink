/**
 * Ratings/reviews domain — pure + unit tested. Real data only: an average is
 * computed from actual reviews, never seeded with a vanity number.
 */

export const REVIEW_TAGS = [
  'Quality',
  'Fast response',
  'On-time delivery',
  'Documentation',
  'Regulatory compliance',
  'Competitive pricing',
  'Communication',
] as const;
export type ReviewTag = (typeof REVIEW_TAGS)[number];

/**
 * Coerces input to a valid star rating. Returns 0 for "no/invalid rating"
 * (empty, non-numeric, ≤0) so submit validation can reject it; 1..5 otherwise
 * (anything above 5 caps at 5). An unpicked star ('0') therefore fails, as it
 * should — it never silently becomes a 1-star review.
 */
export function clampRating(n: unknown): number {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v) || v < 1) return 0;
  return Math.min(5, v);
}

export interface RatingSummary {
  average: number; // rounded to 1 dp, 0 when no reviews
  count: number;
  /** distribution[k] = number of k-star reviews, k in 1..5 */
  distribution: Record<number, number>;
}

export function aggregateRating(reviews: { rating: number }[]): RatingSummary {
  const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let sum = 0;
  for (const r of reviews) {
    const k = clampRating(r.rating);
    if (k >= 1) {
      distribution[k] += 1;
      sum += k;
    }
  }
  const count = reviews.length;
  return { average: count ? Math.round((sum / count) * 10) / 10 : 0, count, distribution };
}

/**
 * A verified buyer/both org may review any supplier that is NOT itself. Sellers
 * can't review (they don't buy), and no org can review itself.
 */
export function canReviewSupplier(input: {
  authorOrgId: string | null | undefined;
  authorKind: string | null | undefined; // buyer | seller | both
  supplierOrgId: string;
}): boolean {
  if (!input.authorOrgId) return false;
  if (input.authorOrgId === input.supplierOrgId) return false;
  return input.authorKind === 'buyer' || input.authorKind === 'both';
}

/** Filters a comma list to the known review-tag vocabulary. */
export function parseReviewTags(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const known = new Set<string>(REVIEW_TAGS);
  return raw
    .split(',')
    .map((t) => t.trim())
    .filter((t) => known.has(t));
}
