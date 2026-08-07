import { describe, it, expect } from 'vitest';
import { MATCH_WEIGHTS, matchBand, matchScore, type MatchInput } from './match-score';

const base: MatchInput = {
  requiredCerts: ['US FDA GMP', 'WHO GMP'],
  heldCerts: ['US FDA GMP', 'WHO GMP', 'EU GMP'],
  price: 4.35,
  marketMedian: 4.53,
  leadTimeDays: 21,
  requiredWithinDays: 60,
  responseRate: 0.94,
  onTimeRate: 0.97,
  completedOrders: 112,
};

describe('weights', () => {
  it('sum to 100, so the score is a percentage by construction', () => {
    expect(Object.values(MATCH_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
  });
});

describe('mandatory certificates are a hard gate', () => {
  it('disqualifies rather than scoring low when one is missing', () => {
    const r = matchScore({ ...base, heldCerts: ['US FDA GMP'] });
    expect(r.disqualified).toBe(true);
    expect(r.score).toBeNull();
    expect(r.disqualifiedReason).toContain('1 mandatory certificate');
  });

  it('cannot be offset by a perfect score everywhere else', () => {
    const r = matchScore({ ...base, heldCerts: [], price: 0.01, marketMedian: 100, onTimeRate: 1, responseRate: 1 });
    expect(r.disqualified).toBe(true);
    expect(r.score).toBeNull();
  });

  it('matches case- and whitespace-insensitively', () => {
    expect(matchScore({ ...base, heldCerts: ['  us fda gmp ', 'WHO GMP'] }).disqualified).toBe(false);
  });

  it('rewards preferred certificates without making them mandatory', () => {
    const without = matchScore({ ...base, preferredCerts: ['CEP'], heldCerts: ['US FDA GMP', 'WHO GMP'] });
    const with_ = matchScore({ ...base, preferredCerts: ['CEP'], heldCerts: ['US FDA GMP', 'WHO GMP', 'CEP'] });
    expect(without.disqualified).toBe(false);
    expect(with_.score!).toBeGreaterThan(without.score!);
  });
});

describe('price component', () => {
  it('rewards being below the market median', () => {
    const cheap = matchScore({ ...base, price: 3.85 });
    const dear = matchScore({ ...base, price: 5.2 });
    expect(cheap.score!).toBeGreaterThan(dear.score!);
  });
  it('states the delta in the detail line, not just a number', () => {
    const c = matchScore(base).components.find((x) => x.key === 'price')!;
    expect(c.detail).toMatch(/below market median/);
  });
  it('is unknown — not zero — when there is no market median', () => {
    const c = matchScore({ ...base, marketMedian: null }).components.find((x) => x.key === 'price')!;
    expect(c.points).toBeNull();
    expect(matchScore({ ...base, marketMedian: null }).unknown).toContain('price');
  });
});

describe('lead time component', () => {
  it('scores zero when the quote misses the required-by date', () => {
    const c = matchScore({ ...base, leadTimeDays: 90 }).components.find((x) => x.key === 'leadTime')!;
    expect(c.points).toBe(0);
    expect(c.detail).toContain('misses the required-by date');
  });
  it('is unknown when the request has no required-by window', () => {
    expect(matchScore({ ...base, requiredWithinDays: null }).unknown).toContain('leadTime');
  });
  it('distinguishes "deadline passed" from "no deadline set"', () => {
    const passed = matchScore({ ...base, requiredWithinDays: 0 }).components.find((c) => c.key === 'leadTime')!;
    expect(passed.points).toBe(0);
    expect(passed.detail).toContain('already passed');
    expect(passed.detail).not.toContain('No required-by date');
  });
});

describe('reliability component', () => {
  it('refuses to judge a supplier with too few orders', () => {
    const r = matchScore({ ...base, completedOrders: 2 });
    expect(r.unknown).toContain('reliability');
    expect(r.components.find((c) => c.key === 'reliability')!.detail).toContain('too few to judge');
  });
  it('gives no credit below a 90% on-time rate', () => {
    expect(matchScore({ ...base, onTimeRate: 0.85 }).components.find((c) => c.key === 'reliability')!.points).toBe(0);
  });
});

describe('score and coverage', () => {
  it('scores a strong supplier highly with full coverage', () => {
    const r = matchScore(base);
    expect(r.score!).toBeGreaterThan(80);
    expect(r.coverage).toBe(1);
    expect(r.unknown).toEqual([]);
  });

  it('rescales over assessable components and reports reduced coverage', () => {
    const newSupplier = matchScore({ ...base, onTimeRate: null, completedOrders: 0, responseRate: null });
    expect(newSupplier.score).not.toBeNull();
    expect(newSupplier.coverage).toBeLessThan(1);
    expect(newSupplier.unknown).toEqual(expect.arrayContaining(['reliability', 'responsiveness']));
  });

  it('does not punish a new supplier for having no history', () => {
    const veteran = matchScore(base);
    const fresh = matchScore({ ...base, onTimeRate: null, completedOrders: 0, responseRate: null });
    // Same certs, price and lead time — the score should be comparable, with the
    // difference disclosed through coverage rather than hidden in the number.
    expect(Math.abs(fresh.score! - veteran.score!)).toBeLessThan(20);
  });

  it('every component carries a human-readable justification', () => {
    for (const c of matchScore(base).components) {
      expect(c.detail.length, c.key).toBeGreaterThan(3);
      expect(c.max).toBe(MATCH_WEIGHTS[c.key]);
    }
  });

  it('is reproducible by hand from its components', () => {
    const r = matchScore(base);
    const earned = r.components.reduce((a, c) => a + (c.points ?? 0), 0);
    const available = r.components.filter((c) => c.points != null).reduce((a, c) => a + c.max, 0);
    expect(Math.round((earned / available) * 100)).toBe(r.score);
  });
});

describe('matchBand', () => {
  it('bands the score for display', () => {
    expect(matchBand(95)).toBe('excellent');
    expect(matchBand(80)).toBe('good');
    expect(matchBand(65)).toBe('fair');
    expect(matchBand(40)).toBe('weak');
  });
});
