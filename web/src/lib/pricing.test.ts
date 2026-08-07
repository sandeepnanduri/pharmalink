import { describe, it, expect } from 'vitest';
import { aggregatePrices, vsMarket, deltaLabel } from './pricing';

describe('aggregatePrices', () => {
  it('computes min/avg/max/count from real prices', () => {
    expect(aggregatePrices([14, 16, 15])).toEqual({ min: 14, avg: 15, max: 16, count: 3 });
  });
  it('ignores non-positive/garbage prices', () => {
    expect(aggregatePrices([10, 0, -5, NaN, 20])).toEqual({ min: 10, avg: 15, max: 20, count: 2 });
  });
  it('is all-zero for an empty set (no fabricated benchmark)', () => {
    expect(aggregatePrices([])).toEqual({ min: 0, avg: 0, max: 0, count: 0 });
  });
});

describe('vsMarket', () => {
  it('classifies below / at / above with a signed delta', () => {
    expect(vsMarket(15.2, 16.8)).toEqual({ deltaPct: -9.5, position: 'below' });
    expect(vsMarket(17.5, 16.8).position).toBe('above');
    expect(vsMarket(16.8, 16.8)).toEqual({ deltaPct: 0, position: 'at' });
  });
  it('is neutral when there is no market reference', () => {
    expect(vsMarket(15, 0)).toEqual({ deltaPct: 0, position: 'at' });
  });
});

describe('deltaLabel', () => {
  it('formats a signed percentage', () => {
    expect(deltaLabel(-9.5)).toBe('-9.5%');
    expect(deltaLabel(4.5)).toBe('+4.5%');
    expect(deltaLabel(0)).toBe('0%');
  });
});
