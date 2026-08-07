import { describe, it, expect } from 'vitest';
import { MIN_ABS_R, MIN_OVERLAP, alignOnPeriod, analyseDrivers, pearson, ranks, spearman, strengthOf, type DriverSeries } from './drivers';
import { addMonths, type SeriesPoint } from './forecast';

const hist = (start: string, values: number[]): SeriesPoint[] =>
  values.map((value, i) => ({ period: addMonths(start, i), value, n: 1, weight: 1 }));

const driver = (key: string, start: string, values: number[]): DriverSeries => ({
  key,
  label: key,
  points: values.map((value, i) => ({ period: addMonths(start, i), value })),
});

describe('pearson', () => {
  it('is 1 / -1 on perfectly linear relationships', () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1);
    expect(pearson([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1);
  });
  it('is 0 when a series is flat (no relationship to detect)', () => {
    expect(pearson([1, 2, 3], [5, 5, 5])).toBe(0);
    expect(pearson([1], [5])).toBe(0);
  });
});

describe('ranks / spearman', () => {
  it('averages tied ranks', () => {
    expect(ranks([10, 20, 20, 30])).toEqual([1, 2.5, 2.5, 4]);
  });
  it('detects a monotonic relationship that Pearson understates', () => {
    const x = [1, 2, 3, 4, 5];
    const y = [1, 2, 3, 4, 100]; // monotonic but wildly non-linear
    expect(spearman(x, y)).toBeCloseTo(1);
    expect(pearson(x, y)).toBeLessThan(spearman(x, y));
  });
});

describe('alignOnPeriod', () => {
  it('matches on the same month at lag 0 and drops unmatched months', () => {
    const a = alignOnPeriod(
      [
        { period: '2026-01', value: 10 },
        { period: '2026-02', value: 11 },
        { period: '2026-03', value: 12 },
      ],
      [
        { period: '2026-01', value: 80 },
        { period: '2026-03', value: 90 },
      ],
    );
    expect(a.periods).toEqual(['2026-01', '2026-03']);
    expect(a.b).toEqual([80, 90]);
  });

  it('shifts the driver back so lag N means "driver leads by N months"', () => {
    const a = alignOnPeriod([{ period: '2026-06', value: 10 }], [{ period: '2026-03', value: 77 }], 3);
    expect(a.periods).toEqual(['2026-06']);
    expect(a.b).toEqual([77]);
  });
});

describe('strengthOf', () => {
  it('bands by absolute magnitude, direction-agnostic', () => {
    expect(strengthOf(0.85)).toBe('strong');
    expect(strengthOf(-0.85)).toBe('strong');
    expect(strengthOf(0.7)).toBe('moderate');
    expect(strengthOf(0.55)).toBe('weak');
  });
});

describe('analyseDrivers', () => {
  const twelve = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];

  it('finds a same-month driver and reports n and direction', () => {
    const insights = analyseDrivers(hist('2025-01', twelve), [driver('fx', '2025-01', twelve.map((v) => v * 3))]);
    expect(insights).toHaveLength(1);
    expect(insights[0]).toMatchObject({ key: 'fx', lag: 0, direction: 'positive', strength: 'strong', n: 12 });
    expect(insights[0].r).toBe(1);
  });

  it('reports a negative relationship as negative', () => {
    const insights = analyseDrivers(
      hist('2025-01', twelve),
      [driver('inverse', '2025-01', twelve.map((v) => 100 - v))],
    );
    expect(insights[0].direction).toBe('negative');
    expect(insights[0].r).toBe(-1);
  });

  it('recovers the lead time when the driver moves first', () => {
    // A jagged driver so only ONE alignment fits. A monotonic series would
    // correlate perfectly at every lag and prove nothing.
    const jagged = [3, 9, 1, 7, 2, 12, 4, 10, 5, 15, 6, 11, 8, 14];
    // Price repeats the driver two months later, so lag 2 is the only fit.
    const insights = analyseDrivers(hist('2025-03', jagged.slice(0, 12)), [driver('lead', '2025-01', jagged)]);
    expect(insights[0].lag).toBe(2);
    expect(insights[0].r).toBe(1);
  });

  it('breaks a tie toward the shortest lag rather than the flattering one', () => {
    // Identical monotonic series correlate perfectly at EVERY lag; reporting a
    // six-month lead here would be an artefact of searching seven of them.
    expect(analyseDrivers(hist('2025-03', twelve), [driver('same', '2025-01', twelve)])[0].lag).toBe(0);
  });

  it('drops a driver with too little overlap rather than reporting a lucky r', () => {
    const short = twelve.slice(0, MIN_OVERLAP - 1);
    expect(analyseDrivers(hist('2025-01', short), [driver('short', '2025-01', short)])).toEqual([]);
  });

  it('drops a driver whose correlation is inside the noise band', () => {
    const noise = [5, 9, 2, 7, 3, 8, 1, 6, 4, 9, 2, 7];
    const insights = analyseDrivers(hist('2025-01', twelve), [driver('noise', '2025-01', noise)]);
    for (const i of insights) expect(Math.abs(i.r)).toBeGreaterThanOrEqual(MIN_ABS_R);
  });

  it('sorts by strength and carries the latest value for context', () => {
    // The second driver is monotonic-with-a-reversal, so no lag reaches 1.
    const insights = analyseDrivers(hist('2025-01', twelve), [
      driver('weaker', '2025-01', [10, 21, 12, 19, 14, 17, 16, 15, 18, 13, 20, 11]),
      driver('perfect', '2025-01', twelve.map((v) => v * 3)),
    ]);
    expect(insights[0].key).toBe('perfect');
    expect(Math.abs(insights[0].r)).toBeGreaterThanOrEqual(Math.abs(insights.at(-1)!.r));
    expect(insights[0].latest).toBe(63);
    expect(insights[0].latestPeriod).toBe('2025-12');
    expect(insights[0].changePct).toBe(5);
  });

  it('returns nothing rather than throwing when there is no history', () => {
    expect(analyseDrivers([], [driver('fx', '2025-01', twelve)])).toEqual([]);
  });
});
