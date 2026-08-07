import { describe, it, expect } from 'vitest';
import {
  MIN_HISTORY,
  addMonths,
  backtestModel,
  conformalBand,
  prospectiveCoverage,
  buildMonthlySeries,
  longestContiguousRun,
  strandedTail,
  forecast,
  gradeConfidence,
  median,
  monthDiff,
  monthKey,
  quantileSorted,
  scoreForecast,
  theilSenSlope,
  weightedMedian,
  type RawObservation,
} from './forecast';

/** Helper: one observation on the 15th of the given month. */
const obs = (period: string, price: number, qtyKg?: number, weight = 1): RawObservation => {
  const [y, m] = period.split('-').map(Number);
  return { observedAt: new Date(Date.UTC(y, m - 1, 15)), unitPriceUsdKg: price, quantityKg: qtyKg, weight };
};

/** Helper: `count` months starting at `start`, priced by `fn`. */
const seriesOf = (start: string, count: number, fn: (i: number) => number) =>
  Array.from({ length: count }, (_, i) => obs(addMonths(start, i), fn(i)));

describe('month helpers', () => {
  it('buckets in UTC and rolls the year over', () => {
    expect(monthKey(new Date(Date.UTC(2026, 0, 31, 23, 59)))).toBe('2026-01');
    expect(addMonths('2026-11', 3)).toBe('2027-02');
    expect(addMonths('2026-03', -4)).toBe('2025-11');
    expect(monthDiff('2025-11', '2026-02')).toBe(3);
  });
});

describe('median / quantileSorted', () => {
  it('averages the middle pair for even counts', () => {
    expect(median([3, 1, 4, 2])).toBe(2.5);
    expect(median([])).toBe(0);
  });
  it('interpolates linearly between order statistics', () => {
    expect(quantileSorted([10, 20, 30, 40], 0.5)).toBe(25);
    expect(quantileSorted([10, 20, 30, 40], 0)).toBe(10);
    expect(quantileSorted([10, 20, 30, 40], 1)).toBe(40);
    expect(quantileSorted([42], 0.9)).toBe(42);
  });
});

describe('weightedMedian', () => {
  it('lets weight, not count, decide the centre', () => {
    // Three cheap 1kg samples vs one heavy lot: the heavy lot carries the median.
    expect(
      weightedMedian([
        { value: 10, weight: 1 },
        { value: 11, weight: 1 },
        { value: 12, weight: 1 },
        { value: 30, weight: 100 },
      ]),
    ).toBe(30);
  });
  it('takes the midpoint on an exact even split', () => {
    expect(
      weightedMedian([
        { value: 10, weight: 5 },
        { value: 20, weight: 5 },
      ]),
    ).toBe(15);
  });
  it('is 0 for nothing usable rather than NaN', () => {
    expect(weightedMedian([])).toBe(0);
    expect(weightedMedian([{ value: 10, weight: 0 }])).toBe(0);
  });
});

describe('theilSenSlope', () => {
  it('recovers a clean linear slope', () => {
    expect(theilSenSlope([10, 12, 14, 16])).toBe(2);
  });
  it('ignores a single wild outlier that would wreck least squares', () => {
    // OLS on this series is dragged hard by the 900; the median of pairwise
    // slopes is not.
    expect(theilSenSlope([10, 12, 14, 900, 18, 20])).toBe(2);
  });
  it('is 0 with fewer than two points', () => {
    expect(theilSenSlope([5])).toBe(0);
  });
});

describe('buildMonthlySeries', () => {
  it('collapses a month to one weighted-median price and counts the inputs', () => {
    const series = buildMonthlySeries([obs('2026-01', 10), obs('2026-01', 12), obs('2026-02', 14)]);
    expect(series.map((p) => p.period)).toEqual(['2026-01', '2026-02']);
    expect(series[0].value).toBe(11);
    expect(series[0].n).toBe(2);
  });
  it('weights volume sub-linearly (√kg), so a big lot leads without dictating', () => {
    // 100 kg at $30 -> weight 10; 1 kg at $10 -> weight 1. Median lands on 30.
    expect(buildMonthlySeries([obs('2026-01', 10, 1), obs('2026-01', 30, 100)])[0].value).toBe(30);
  });
  it('drops non-positive prices instead of averaging them in', () => {
    expect(buildMonthlySeries([obs('2026-01', 0), obs('2026-01', -3), obs('2026-01', 20)])[0]).toMatchObject({ value: 20, n: 1 });
  });
  it('never invents a month that had no trade', () => {
    const series = buildMonthlySeries([obs('2026-01', 10), obs('2026-04', 14)]);
    expect(series.map((p) => p.period)).toEqual(['2026-01', '2026-04']);
  });
});

describe('longestContiguousRun', () => {
  it('keeps the unbroken run and drops the stranded older point', () => {
    const series = buildMonthlySeries([obs('2025-01', 9), obs('2026-01', 10), obs('2026-02', 11), obs('2026-03', 12)]);
    expect(longestContiguousRun(series).map((p) => p.period)).toEqual(['2026-01', '2026-02', '2026-03']);
  });

  it('keeps a long run rather than a fresher one-point run after a reporting gap', () => {
    // The real shape: 8 months of customs data, then a single platform quote
    // three months later. Taking the tail would throw away the whole history.
    const series = buildMonthlySeries([...seriesOf('2025-06', 8, () => 20), obs('2026-05', 25)]);
    expect(longestContiguousRun(series)).toHaveLength(8);
    expect(strandedTail(series, longestContiguousRun(series)).map((p) => p.period)).toEqual(['2026-05']);
  });

  it('breaks a length tie toward the more recent run', () => {
    const series = buildMonthlySeries([...seriesOf('2025-01', 3, () => 10), ...seriesOf('2025-07', 3, () => 20)]);
    expect(longestContiguousRun(series).map((p) => p.period)).toEqual(['2025-07', '2025-08', '2025-09']);
  });

  it('handles an empty history', () => {
    expect(longestContiguousRun([])).toEqual([]);
    expect(strandedTail([], [])).toEqual([]);
  });
});

describe('backtestModel', () => {
  it('scores a flat series as perfect and keeps one residual pair per fold', () => {
    const r = backtestModel([20, 20, 20, 20, 20, 20, 20, 20]);
    expect(r.folds).toBe(4);
    expect(r.mape).toBe(0);
    expect(r.residuals).toHaveLength(4);
    expect(r.residuals[0]).toMatchObject({ actual: 20 });
  });
  it('reports real error on a series it cannot track', () => {
    const jumpy = [10, 40, 12, 38, 11, 42, 13, 39, 10, 41];
    expect(backtestModel(jumpy).mape).toBeGreaterThan(20);
  });
});

describe('prospectiveCoverage', () => {
  const res = (pcts: number[], predicted = 100) => pcts.map((p) => ({ predicted, actual: predicted * (1 + p / 100) }));

  it('is 0 when there is not enough history to make the claim', () => {
    expect(prospectiveCoverage(res([1, -2, 3]), 0.8)).toBe(0);
  });

  it('reports ~100% when the model is consistently accurate', () => {
    expect(prospectiveCoverage(res(Array.from({ length: 30 }, (_, i) => (i % 2 ? 2 : -2))), 0.8)).toBeGreaterThan(0.9);
  });

  it('catches under-coverage when errors keep growing beyond past experience', () => {
    // Each error is bigger than every error before it, so a band fitted on the
    // past systematically fails to contain the present.
    const escalating = res(Array.from({ length: 25 }, (_, i) => (i + 1) * 6));
    expect(prospectiveCoverage(escalating, 0.8)).toBeLessThan(0.5);
  });

  it('does not simply echo the requested level (the circularity bug)', () => {
    const a = prospectiveCoverage(res(Array.from({ length: 30 }, (_, i) => (i % 2 ? 1 : -1))), 0.8);
    const b = prospectiveCoverage(res(Array.from({ length: 25 }, (_, i) => (i + 1) * 6)), 0.8);
    expect(a).not.toBeCloseTo(b, 2);
  });
});

describe('conformalBand', () => {
  const res = (pcts: number[], predicted = 100) => pcts.map((p) => ({ predicted, actual: predicted * (1 + p / 100) }));

  it('is multiplicative — the point sits at the geometric centre', () => {
    const b = conformalBand(50, res([-20, -10, 10, 20, 5, -5]), 0.8);
    expect(Math.sqrt(b.lower * b.upper)).toBeCloseTo(50, 6);
  });
  it('keeps a strictly positive floor even on a wildly volatile history', () => {
    const b = conformalBand(20, res([-70, -55, 80, 120, -60, 95, -45, 140]), 0.8);
    expect(b.lower).toBeGreaterThan(0);
  });
  it('collapses to a point when the model has never been wrong', () => {
    const b = conformalBand(30, res([0, 0, 0, 0, 0]), 0.8);
    expect(b.upper - b.lower).toBeLessThan(0.001);
  });
  it('returns the point itself when there are no residuals to learn from', () => {
    expect(conformalBand(42, [], 0.8)).toEqual({ lower: 42, upper: 42 });
  });
});

describe('gradeConfidence', () => {
  it('refuses to grade below the minimum history', () => {
    expect(gradeConfidence(MIN_HISTORY - 1, 10, 2)).toBe('insufficient');
  });
  it('is low when the model has been badly wrong or barely tested', () => {
    expect(gradeConfidence(24, 12, 40)).toBe('low');
    expect(gradeConfidence(24, 2, 1)).toBe('low');
  });
  it('reaches high only with long history, many folds and small error', () => {
    expect(gradeConfidence(12, 6, 8)).toBe('high');
    expect(gradeConfidence(11, 6, 8)).toBe('medium');
  });
});

describe('forecast', () => {
  it('refuses to forecast from too little history', () => {
    const r = forecast(seriesOf('2026-01', 4, () => 20));
    expect(r.status).toBe('insufficient_data');
    expect(r.points).toEqual([]);
    expect(r.confidence).toBe('insufficient');
    expect(r.notes.join(' ')).toContain(`at least ${MIN_HISTORY}`);
  });

  it('reports insufficient data when no run is long enough', () => {
    // Three short runs, none of them reaching MIN_HISTORY.
    const fragmented = [...seriesOf('2025-01', 3, () => 20), ...seriesOf('2025-06', 3, () => 21), ...seriesOf('2025-11', 3, () => 22)];
    const r = forecast(fragmented);
    expect(r.status).toBe('insufficient_data');
    expect(r.notes.join(' ')).toContain('gaps');
  });

  it('forecasts from the long run and says what it left stranded', () => {
    const withLateQuote = [...seriesOf('2025-01', 12, () => 20), obs('2026-04', 31)];
    const r = forecast(withLateQuote);
    expect(r.status).toBe('ok');
    expect(r.history).toHaveLength(12);
    expect(r.points[0].period).toBe('2026-01');
    expect(r.notes.join(' ')).toContain('sit after a reporting gap');
  });

  it('projects a flat series flat, with a tight band and honest reasoning', () => {
    const r = forecast(seriesOf('2025-01', 12, () => 20));
    expect(r.status).toBe('ok');
    expect(r.model).toBe('ses-log');
    expect(r.points).toHaveLength(3);
    expect(r.points[0].p50).toBe(20);
    expect(r.points[0].p10).toBe(20);
    expect(r.points[0].p90).toBe(20);
    expect(r.accuracy?.mape).toBe(0);
    expect(r.notes.join(' ')).toContain('no trend or seasonal method beat a level method');
  });

  it('widens the band with horizon and still reports the measured trend', () => {
    const r = forecast(seriesOf('2025-01', 15, (i) => 20 + i), { horizon: 4 });
    expect(r.status).toBe('ok');
    expect(r.points).toHaveLength(4);
    const width = (p: { p10: number; p90: number }) => p.p90 - p.p10;
    expect(width(r.points[3])).toBeGreaterThanOrEqual(width(r.points[0]));
    // The projection is deliberately flat — trend extrapolation lost the
    // bake-off — but the observed trend is still measured and surfaced.
    expect(r.trendPctPerMonth).toBeGreaterThan(0);
    expect(r.points[0].p50).toBeCloseTo(r.points[3].p50, 5);
  });

  it('fits alpha and reports it, so the forecast can be reproduced by hand', () => {
    const r = forecast(seriesOf('2025-01', 12, () => 20));
    expect(r.alpha).toBeGreaterThan(0);
    expect(r.alpha).toBeLessThanOrEqual(1);
    expect(r.notes.join(' ')).toContain('fitted');
  });

  it('never produces a zero or negative lower bound', () => {
    const wild = [4, 30, 6, 28, 5, 33, 7, 26, 4, 31, 8, 29, 5, 35];
    for (const p of forecast(seriesOf('2025-01', wild.length, (i) => wild[i]), { horizon: 6 }).points) {
      expect(p.p10).toBeGreaterThan(0);
    }
  });

  it('keeps p10 <= p50 <= p90 on a volatile series', () => {
    const bumpy = [18, 25, 16, 30, 14, 28, 19, 33, 15, 27, 21, 31];
    const r = forecast(seriesOf('2025-01', bumpy.length, (i) => bumpy[i]));
    expect(r.status).toBe('ok');
    for (const p of r.points) {
      expect(p.p10).toBeLessThanOrEqual(p.p50);
      expect(p.p90).toBeGreaterThanOrEqual(p.p50);
    }
    expect(r.volatilityPct).toBeGreaterThan(0);
    // A wild series must not be sold as a reliable forecast.
    expect(r.confidence).not.toBe('high');
  });

  it('never projects a negative price', () => {
    const collapsing = seriesOf('2025-01', 12, (i) => Math.max(1, 40 - i * 3.5));
    for (const p of forecast(collapsing, { horizon: 12 }).points) {
      expect(p.p10).toBeGreaterThanOrEqual(0);
      expect(p.p50).toBeGreaterThanOrEqual(0);
    }
  });

  it('clamps the horizon to a sane range', () => {
    expect(forecast(seriesOf('2025-01', 12, () => 20), { horizon: 99 }).points).toHaveLength(12);
    expect(forecast(seriesOf('2025-01', 12, () => 20), { horizon: 0 }).points).toHaveLength(1);
  });

  it('starts the projection at the month after the last observed one', () => {
    const r = forecast(seriesOf('2025-06', 8, () => 20));
    expect(r.history[r.history.length - 1].period).toBe('2026-01');
    expect(r.points[0].period).toBe('2026-02');
  });
});

describe('scoreForecast', () => {
  it('grades a past forecast against what actually happened', () => {
    expect(scoreForecast({ p10: 18, p50: 20, p90: 22 }, 21)).toEqual({ actual: 21, errorPct: -4.8, withinBand: true });
    expect(scoreForecast({ p10: 18, p50: 20, p90: 22 }, 30)?.withinBand).toBe(false);
  });
  it('returns null when there is no actual to score against', () => {
    expect(scoreForecast({ p10: 18, p50: 20, p90: 22 }, 0)).toBeNull();
  });
});
