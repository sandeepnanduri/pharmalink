import { describe, it, expect } from 'vitest';
import { CANDIDATES, ar1, combine, historicalMean, inLogSpace, linearTrend, naive, ols, ses, theilSen, theta } from './models';

/**
 * These test the candidate library's mechanics. Which candidate is BEST is not
 * asserted here — that is measured by `scripts/model-bakeoff.ts` against real
 * captured data, and a unit test that pinned the ranking would just freeze
 * whatever the data said on the day it was written.
 */

const flat = Array.from({ length: 30 }, () => 20);
const rising = Array.from({ length: 30 }, (_, i) => 10 + i);
const exponential = Array.from({ length: 30 }, (_, i) => 10 * Math.pow(1.05, i));

describe('ols / theilSen', () => {
  it('recovers a clean slope', () => {
    expect(ols(rising).slope).toBeCloseTo(1);
    expect(theilSen(rising)).toBeCloseTo(1);
  });
  it('theilSen ignores an outlier that drags OLS', () => {
    const dirty = [10, 11, 12, 13, 900, 15, 16, 17];
    expect(theilSen(dirty)).toBeCloseTo(1);
    expect(ols(dirty).slope).toBeGreaterThan(5);
  });
  it('is 0 on a single point rather than NaN', () => {
    expect(ols([5]).slope).toBe(0);
    expect(theilSen([5])).toBe(0);
  });
});

describe('every candidate', () => {
  it('returns exactly h finite, non-negative values', () => {
    for (const m of CANDIDATES) {
      const train = Array.from({ length: 40 }, (_, i) => 20 + Math.sin(i) * 3);
      const out = m.fit(train, 3);
      expect(out, m.key).toHaveLength(3);
      for (const v of out) {
        expect(Number.isFinite(v), `${m.key} produced ${v}`).toBe(true);
        expect(v, m.key).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('never returns NaN on a flat series (zero-variance is a real case)', () => {
    for (const m of CANDIDATES) {
      if (flat.length < m.minTrain) continue;
      for (const v of m.fit(flat, 2)) expect(Number.isFinite(v), m.key).toBe(true);
    }
  });

  it('reproduces a constant series closely', () => {
    for (const m of CANDIDATES) {
      if (flat.length < m.minTrain) continue;
      // Historical-mean-like and trend methods are all exact on a constant.
      expect(m.fit(flat, 1)[0], m.key).toBeCloseTo(20, 5);
    }
  });
});

describe('naive / mean', () => {
  it('naive repeats the last value', () => {
    expect(naive.fit([1, 2, 7], 3)).toEqual([7, 7, 7]);
  });
  it('mean returns the average', () => {
    expect(historicalMean.fit([10, 20, 30], 2)).toEqual([20, 20]);
  });
});

describe('ses', () => {
  it('sits between the last value and the series mean', () => {
    const rise = [10, 12, 14, 16, 18, 20];
    const p = ses.fit(rise, 1)[0];
    expect(p).toBeGreaterThan(15);
    expect(p).toBeLessThanOrEqual(20);
  });
  it('is flat across the horizon (it has no trend term)', () => {
    const out = ses.fit([10, 12, 11, 13, 12, 14], 3);
    expect(out[0]).toBeCloseTo(out[2], 9);
  });
});

describe('theta', () => {
  it('adds only half the linear slope, so it lands under a pure trend model', () => {
    const t = theta.fit(rising, 1)[0];
    const l = linearTrend.fit(rising, 1)[0];
    expect(t).toBeLessThan(l);
    expect(t).toBeGreaterThan(rising[rising.length - 1] - 1);
  });
});

describe('ar1', () => {
  it('pulls back toward the mean from an extreme last value', () => {
    const series = [...Array.from({ length: 20 }, () => 20), 40];
    const p = ar1.fit(series, 1)[0];
    expect(p).toBeLessThan(40);
    expect(p).toBeGreaterThan(19);
  });
});

describe('inLogSpace', () => {
  it('turns constant % growth into something a linear method can follow', () => {
    const logLinear = inLogSpace(linearTrend);
    const predicted = logLinear.fit(exponential, 1)[0];
    const truth = 10 * Math.pow(1.05, 30);
    expect(Math.abs(predicted - truth) / truth).toBeLessThan(0.02);
  });
  it('cannot produce a negative price even from a steep decline', () => {
    const collapsing = Array.from({ length: 20 }, (_, i) => 100 * Math.pow(0.8, i));
    for (const v of inLogSpace(linearTrend).fit(collapsing, 12)) expect(v).toBeGreaterThan(0);
  });
  it('survives a zero in the input rather than returning NaN', () => {
    expect(Number.isFinite(inLogSpace(ses).fit([10, 0, 12, 11, 13], 1)[0])).toBe(true);
  });
});

describe('combine', () => {
  it('takes the median of its members, so one blow-up cannot drag it', () => {
    const wild = { key: 'wild', label: 'wild', minTrain: 1, fit: () => [1e9] };
    const c = combine([naive, ses, wild]);
    const out = c.fit([10, 11, 12, 13, 14, 15], 1)[0];
    expect(out).toBeLessThan(100);
  });
  it('falls back to naive when no member has enough history', () => {
    const hungry = { key: 'hungry', label: 'hungry', minTrain: 999, fit: () => [0] };
    expect(combine([hungry]).fit([5, 6, 7], 1)).toEqual([7]);
  });
});
