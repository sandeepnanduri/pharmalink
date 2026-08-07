import { describe, it, expect } from 'vitest';
import { clampRating, aggregateRating, canReviewSupplier, parseReviewTags } from './reviews';

describe('clampRating', () => {
  it('accepts 1..5 and caps above 5', () => {
    expect(clampRating(4)).toBe(4);
    expect(clampRating('5')).toBe(5);
    expect(clampRating(9)).toBe(5);
    expect(clampRating(3.7)).toBe(4);
  });
  it('returns 0 for "no/invalid rating" so validation rejects it', () => {
    expect(clampRating(0)).toBe(0); // unpicked star submits '0'
    expect(clampRating('0')).toBe(0);
    expect(clampRating(-3)).toBe(0);
    expect(clampRating('abc')).toBe(0);
    expect(clampRating(null)).toBe(0);
  });
});

describe('aggregateRating — real average from real reviews', () => {
  it('computes average, count and distribution', () => {
    const s = aggregateRating([{ rating: 5 }, { rating: 4 }, { rating: 4 }]);
    expect(s.count).toBe(3);
    expect(s.average).toBe(4.3);
    expect(s.distribution[4]).toBe(2);
    expect(s.distribution[5]).toBe(1);
  });
  it('is zero for an empty set — never a vanity default', () => {
    const s = aggregateRating([]);
    expect(s.average).toBe(0);
    expect(s.count).toBe(0);
  });
});

describe('canReviewSupplier', () => {
  it('allows a verified buyer/both org to review another org', () => {
    expect(canReviewSupplier({ authorOrgId: 'a', authorKind: 'buyer', supplierOrgId: 'b' })).toBe(true);
    expect(canReviewSupplier({ authorOrgId: 'a', authorKind: 'both', supplierOrgId: 'b' })).toBe(true);
  });
  it('blocks self-review, sellers, and anonymous', () => {
    expect(canReviewSupplier({ authorOrgId: 'a', authorKind: 'buyer', supplierOrgId: 'a' })).toBe(false);
    expect(canReviewSupplier({ authorOrgId: 'a', authorKind: 'seller', supplierOrgId: 'b' })).toBe(false);
    expect(canReviewSupplier({ authorOrgId: null, authorKind: 'buyer', supplierOrgId: 'b' })).toBe(false);
  });
});

describe('parseReviewTags', () => {
  it('keeps only known tags', () => {
    expect(parseReviewTags('Quality, Fast response, HACKED, On-time delivery')).toEqual([
      'Quality',
      'Fast response',
      'On-time delivery',
    ]);
    expect(parseReviewTags(null)).toEqual([]);
  });
});
