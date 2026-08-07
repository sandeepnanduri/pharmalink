/**
 * Driver analysis — which macro series move WITH a molecule's price, and at
 * what lag. Pure and unit-tested.
 *
 * This module reports CORRELATION and refuses to dress it as causation. Three
 * guards keep it honest:
 *
 *  - a minimum overlap (`MIN_OVERLAP`) before any coefficient is reported, so a
 *    perfect r on four points never reaches the UI;
 *  - Spearman (rank) correlation by default, so one spike cannot manufacture a
 *    relationship the way it can with Pearson;
 *  - lag search is bounded and the chosen lag is always disclosed, because
 *    "best of 12 lags" is a weaker claim than "correlated" and must read as one.
 */

import type { SeriesPoint } from './forecast';

/** A candidate explanatory series, already bucketed by month. */
export interface DriverSeries {
  key: string;
  label: string;
  unit?: string;
  points: { period: string; value: number }[];
}

/** Below this many overlapping months, no coefficient is reported at all. */
export const MIN_OVERLAP = 8;
/** Below this absolute correlation, the relationship is treated as noise. */
export const MIN_ABS_R = 0.5;
/** Months of lag to search (driver leads price by 0..MAX_LAG months). */
export const MAX_LAG = 6;
/**
 * How much better a longer lag must be before it displaces a shorter one.
 *
 * Taking the maximum over seven lags is a multiple-comparison problem: the best
 * of seven coefficients is biased upward even against pure noise. Requiring a
 * margin, and breaking ties toward the shortest lag, keeps the search from
 * dressing up an accident as a six-month lead indicator.
 */
export const LAG_IMPROVEMENT_MARGIN = 0.05;

export function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

/** Pearson product-moment correlation. Returns 0 when either series is flat. */
export function pearson(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;
  const mx = mean(x.slice(0, n));
  const my = mean(y.slice(0, n));
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a = x[i] - mx;
    const b = y[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  if (dx === 0 || dy === 0) return 0;
  return num / Math.sqrt(dx * dy);
}

/** Fractional ranks, averaging ties (so a plateau doesn't fake an ordering). */
export function ranks(values: number[]): number[] {
  const idx = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const out = new Array<number>(values.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1].v === idx[i].v) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) out[idx[k].i] = avg;
    i = j + 1;
  }
  return out;
}

/** Spearman rank correlation — Pearson over ranks. Robust to spikes. */
export function spearman(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;
  return pearson(ranks(x.slice(0, n)), ranks(y.slice(0, n)));
}

/**
 * Aligns a price series and a driver series on month keys, with the driver
 * shifted `lag` months EARLIER (lag > 0 means the driver leads the price).
 */
export function alignOnPeriod(
  price: { period: string; value: number }[],
  driver: { period: string; value: number }[],
  lag = 0,
): { periods: string[]; a: number[]; b: number[] } {
  const byPeriod = new Map(driver.map((d) => [d.period, d.value]));
  const periods: string[] = [];
  const a: number[] = [];
  const b: number[] = [];
  for (const p of price) {
    const shifted = shiftPeriod(p.period, -lag);
    const v = byPeriod.get(shifted);
    if (v === undefined || !Number.isFinite(v)) continue;
    periods.push(p.period);
    a.push(p.value);
    b.push(v);
  }
  return { periods, a, b };
}

function shiftPeriod(period: string, offset: number): string {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + offset, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export type Strength = 'weak' | 'moderate' | 'strong';
export type Direction = 'positive' | 'negative';

export interface DriverInsight {
  key: string;
  label: string;
  unit: string;
  /** Spearman coefficient at the best lag, -1..1. */
  r: number;
  /** Months the driver leads the price. 0 = same month. */
  lag: number;
  /** Overlapping months the coefficient is computed from. */
  n: number;
  direction: Direction;
  strength: Strength;
  /** Latest driver value and its month-on-month change, for context. */
  latest: number | null;
  latestPeriod: string | null;
  changePct: number | null;
}

export function strengthOf(r: number): Strength {
  const a = Math.abs(r);
  if (a >= 0.8) return 'strong';
  if (a >= 0.65) return 'moderate';
  return 'weak';
}

/**
 * Best lag for one driver: the shortest lead that explains the price, not the
 * flattering one. A longer lag must beat the incumbent by
 * `LAG_IMPROVEMENT_MARGIN`, so same-month wins every tie.
 */
function bestLag(
  price: { period: string; value: number }[],
  points: { period: string; value: number }[],
): { r: number; lag: number; n: number } | null {
  let best: { r: number; lag: number; n: number } | null = null;
  for (let lag = 0; lag <= MAX_LAG; lag++) {
    const { a, b } = alignOnPeriod(price, points, lag);
    if (a.length < MIN_OVERLAP) continue;
    const r = spearman(a, b);
    if (!best || Math.abs(r) > Math.abs(best.r) + LAG_IMPROVEMENT_MARGIN) best = { r, lag, n: a.length };
  }
  return best;
}

/**
 * Correlates each driver against the price history, searching lags 0..MAX_LAG
 * and keeping the shortest lag that explains it best. Drivers with too little overlap, or with a
 * coefficient inside the noise band, are dropped rather than shown faintly —
 * a weak driver on screen still reads as a driver.
 */
export function analyseDrivers(history: SeriesPoint[], drivers: DriverSeries[]): DriverInsight[] {
  const price = history.map((h) => ({ period: h.period, value: h.value }));
  const out: DriverInsight[] = [];

  for (const d of drivers) {
    const best = bestLag(price, d.points);
    if (!best || Math.abs(best.r) < MIN_ABS_R) continue;

    const sorted = [...d.points].sort((x, y) => x.period.localeCompare(y.period));
    const latest = sorted.at(-1) ?? null;
    const prev = sorted.at(-2) ?? null;

    out.push({
      key: d.key,
      label: d.label,
      unit: d.unit ?? '',
      r: Math.round(best.r * 100) / 100,
      lag: best.lag,
      n: best.n,
      direction: best.r >= 0 ? 'positive' : 'negative',
      strength: strengthOf(best.r),
      latest: latest ? latest.value : null,
      latestPeriod: latest ? latest.period : null,
      changePct: latest && prev && prev.value !== 0 ? Math.round(((latest.value - prev.value) / prev.value) * 1000) / 10 : null,
    });
  }

  return out.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
}
