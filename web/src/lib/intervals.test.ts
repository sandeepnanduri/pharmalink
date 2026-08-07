import { describe, it, expect } from 'vitest';
import { INTERVAL_METHODS, conformalRatio, conformalRatioAsymmetric, empiricalPercent, gaussian, intervalScore, pinball } from './intervals';

const residuals = (errsPct: number[], predicted = 100) =>
  errsPct.map((e) => ({ predicted, actual: predicted * (1 + e / 100) }));

describe('every interval method', () => {
  const r = residuals([-20, -10, -5, 0, 5, 10, 15, 25, -30, 40]);

  it('returns lower <= upper, both finite', () => {
    for (const m of INTERVAL_METHODS) {
      const b = m.band(100, r, 0.8);
      expect(Number.isFinite(b.lower), m.key).toBe(true);
      expect(Number.isFinite(b.upper), m.key).toBe(true);
      expect(b.lower, m.key).toBeLessThanOrEqual(b.upper);
    }
  });

  it('never returns a negative lower bound', () => {
    const huge = residuals([-95, -90, 200, 300, -80, 400, -99, 250]);
    for (const m of INTERVAL_METHODS) expect(m.band(10, huge, 0.8).lower, m.key).toBeGreaterThanOrEqual(0);
  });

  it('widens as the requested level rises', () => {
    for (const m of INTERVAL_METHODS) {
      const narrow = m.band(100, r, 0.5);
      const wide = m.band(100, r, 0.95);
      expect(wide.upper - wide.lower, m.key).toBeGreaterThanOrEqual(narrow.upper - narrow.lower);
    }
  });

  it('collapses to a point when the model has never been wrong', () => {
    const perfect = residuals([0, 0, 0, 0, 0, 0]);
    for (const m of INTERVAL_METHODS) {
      const b = m.band(100, perfect, 0.8);
      expect(b.upper - b.lower, m.key).toBeLessThan(0.01);
    }
  });
});

describe('multiplicative bands vs additive', () => {
  /**
   * The defect this replaced: with errors big enough, an additive band's lower
   * bound clamps at zero, and then EVERY outcome counts as "in range" — the
   * interval stops being a claim at all.
   */
  const volatile = residuals([-70, -55, 80, 120, -60, 95, -45, 140]);

  it('additive methods collapse to a zero floor on a volatile series', () => {
    expect(empiricalPercent.band(20, volatile, 0.8).lower).toBe(0);
    expect(gaussian.band(20, volatile, 0.8).lower).toBe(0);
  });

  it('multiplicative methods keep a strictly positive floor', () => {
    expect(conformalRatio.band(20, volatile, 0.8).lower).toBeGreaterThan(0);
    expect(conformalRatioAsymmetric.band(20, volatile, 0.8).lower).toBeGreaterThan(0);
  });

  it('scales the band with the price level, not with dollars', () => {
    const cheap = conformalRatio.band(10, volatile, 0.8);
    const dear = conformalRatio.band(1000, volatile, 0.8);
    // Same relative width at both price levels.
    expect((dear.upper - dear.lower) / 1000).toBeCloseTo((cheap.upper - cheap.lower) / 10, 6);
  });
});

describe('conformalRatio', () => {
  it('is symmetric in log space — the point sits at the geometric centre', () => {
    const b = conformalRatio.band(100, residuals([-20, -10, 10, 20, 5, -5]), 0.8);
    expect(Math.sqrt(b.lower * b.upper)).toBeCloseTo(100, 6);
  });
});

describe('conformalRatioAsymmetric', () => {
  it('leans upward when the errors do — prices spike more than they collapse', () => {
    const skewed = residuals([-5, -4, -3, -2, 2, 4, 30, 60, 90, 120]);
    const b = conformalRatioAsymmetric.band(100, skewed, 0.8);
    expect(b.upper - 100).toBeGreaterThan(100 - b.lower);
  });
});

describe('pinball / intervalScore', () => {
  it('charges the quantile-weighted distance on each side', () => {
    expect(pinball(120, 100, 0.9)).toBeCloseTo(0.9 * 20);
    expect(pinball(80, 100, 0.9)).toBeCloseTo(0.1 * 20);
  });
  it('penalises a wider band that still contains the truth', () => {
    const tight = intervalScore(100, { lower: 95, upper: 105 }, 0.8);
    const loose = intervalScore(100, { lower: 10, upper: 500 }, 0.8);
    expect(loose).toBeGreaterThan(tight);
  });
  it('penalises a miss more than a near-miss', () => {
    const near = intervalScore(106, { lower: 95, upper: 105 }, 0.8);
    const far = intervalScore(300, { lower: 95, upper: 105 }, 0.8);
    expect(far).toBeGreaterThan(near);
  });
});
