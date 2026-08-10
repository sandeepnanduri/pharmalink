/**
 * What a price forecast is actually resting on — pure, no DB/Next imports.
 *
 * A forecast reduces months of heterogeneous observations to one number with a
 * band. That is useful and it is also easy to over-trust: two molecules can
 * show the same p50 when one rests on eleven escrow-confirmed transactions and
 * the other on a single catalogue list price someone typed in.
 *
 * This module answers "on what?", so the page can say it. The forecast itself
 * is unchanged: `weight` is still the only number the maths reads, and it is
 * derived from the confidence label once, at write time, in `vocab.ts`. Nothing
 * here re-derives it — that would be a second place for the two to disagree.
 */

import { CONFIDENCE_WEIGHT, type DataConfidence } from './vocab';

export interface EvidenceInput {
  observedAt: Date;
  unitPriceUsdKg: number;
  weight: number;
  dataConfidence: string | null;
  originCountry: string | null;
  incoterm: string | null;
  purityGrade: string | null;
  outlierFlag: boolean;
  outlierReason: string | null;
  supplierOrgId: string | null;
}

export interface Breakdown {
  label: string;
  count: number;
}

export interface Evidence {
  /** Everything held for this molecule, before exclusions. */
  total: number;
  /** What the forecast actually used. */
  used: number;
  /** Flagged by a curator and deliberately left out — with their reasons. */
  excluded: { count: number; reasons: Breakdown[] };
  /**
   * How the used observations split by confidence. `unstated` is its own bucket
   * rather than being folded into LOW: not knowing how good a number is differs
   * from knowing it is a list price.
   */
  confidence: { HIGH: number; MEDIUM: number; LOW: number; unstated: number };
  /**
   * The mean weight of what went in, 0..1. One number for "how much of this is
   * evidence rather than hearsay" — it moves when the mix moves.
   */
  meanWeight: number;
  origins: Breakdown[];
  incoterms: Breakdown[];
  purityGrades: Breakdown[];
}

const tally = (values: (string | null)[]): Breakdown[] => {
  const counts = new Map<string, number>();
  for (const v of values) {
    if (!v) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([label, count]) => ({ label, count }));
};

/**
 * Splits observations into what the forecast may use and what it may not.
 *
 * An outlier is excluded because a curator said so, and the exclusion is
 * reported rather than silent: a page that quietly drops a third of its inputs
 * is claiming more certainty than it has.
 */
export function partitionObservations<T extends { outlierFlag: boolean }>(rows: T[]): { used: T[]; excluded: T[] } {
  const used: T[] = [];
  const excluded: T[] = [];
  for (const r of rows) (r.outlierFlag ? excluded : used).push(r);
  return { used, excluded };
}

export function summariseEvidence(rows: EvidenceInput[]): Evidence {
  const { used, excluded } = partitionObservations(rows);

  const confidence = { HIGH: 0, MEDIUM: 0, LOW: 0, unstated: 0 };
  for (const r of used) {
    const key = (r.dataConfidence ?? '') as DataConfidence;
    if (key in CONFIDENCE_WEIGHT) confidence[key] += 1;
    else confidence.unstated += 1;
  }

  const meanWeight = used.length === 0 ? 0 : used.reduce((n, r) => n + (r.weight ?? 0), 0) / used.length;

  return {
    total: rows.length,
    used: used.length,
    excluded: {
      count: excluded.length,
      // Grouped, because twelve rows excluded for one reason is a different
      // story from twelve excluded for twelve.
      reasons: tally(excluded.map((r) => r.outlierReason ?? 'Unstated reason')),
    },
    confidence,
    meanWeight: Math.round(meanWeight * 100) / 100,
    origins: tally(used.map((r) => r.originCountry)),
    incoterms: tally(used.map((r) => r.incoterm)),
    purityGrades: tally(used.map((r) => r.purityGrade)),
  };
}

export interface SupplierComparison {
  orgId: string;
  name: string;
  /** The supplier's most recent observed price. */
  latestUsdKg: number;
  observedAt: Date;
  observations: number;
  /**
   * The median this supplier was measured against — everyone else's prices in
   * the window. Shown on screen, so the percentage below is a checkable
   * statement rather than an accusation. `null` when no window qualified.
   */
  benchmarkUsdKg: number | null;
  /** Half-width of the window used, in months. 0 = the same month alone. */
  windowMonths: number | null;
  /** Percent above (+) or below (−) the benchmark. `null` when there is none. */
  vsMarketPct: number | null;
}

/**
 * How far either side of a supplier's latest observation we will look for a
 * market to compare it to.
 *
 * Bounded deliberately. An earlier version fell back to the whole series, which
 * measured an August platform quote against two years of broad-HS customs unit
 * values and announced the supplier was 67% below market — drift and source mix
 * reported as a discount. Past this window we say nothing instead.
 */
const MAX_WINDOW_MONTHS = 3;

/**
 * Minimum other observations before a median describes a market at all.
 *
 * Three, not two: the median of an even pair is their mean, so at two rows the
 * statistic quietly loses the exact outlier resistance it was chosen for -- one
 * mis-keyed 1000 against a real 15 yields a 507.50 "market".
 */
const MIN_BENCHMARK_ROWS = 3;

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Months since epoch, so "one month apart" is arithmetic and not calendar work. */
const monthIndex = (d: Date) => d.getUTCFullYear() * 12 + d.getUTCMonth();

/**
 * Each named supplier's latest price against what everyone else was charging
 * around the same time.
 *
 * Three choices worth stating:
 *
 * - **Median, not mean.** One mis-keyed price in a small series moves a mean far
 *   enough to make every honest supplier look expensive.
 * - **Everyone else's prices, not everyone's.** A supplier with eight of the ten
 *   observations would otherwise be largely compared against itself, and would
 *   read as exactly on-market no matter what it charged.
 * - **A bounded window, or nothing.** See `MAX_WINDOW_MONTHS`.
 */
export function compareSuppliers(
  rows: EvidenceInput[],
  names: Map<string, string>,
): SupplierComparison[] {
  const { used } = partitionObservations(rows);
  if (used.length === 0) return [];

  const bySupplier = new Map<string, EvidenceInput[]>();
  for (const r of used) {
    if (!r.supplierOrgId) continue;
    bySupplier.set(r.supplierOrgId, [...(bySupplier.get(r.supplierOrgId) ?? []), r]);
  }

  const out: SupplierComparison[] = [];
  for (const [orgId, rs] of bySupplier) {
    const latest = rs.reduce((a, b) => (a.observedAt > b.observedAt ? a : b), rs[0]);
    const anchor = monthIndex(latest.observedAt);
    const others = used.filter((r) => r.supplierOrgId !== orgId);

    // Widen a month at a time and stop at the first window that holds a market.
    // The narrowest qualifying window is the most like-for-like one.
    let benchmark: number | null = null;
    let windowMonths: number | null = null;
    for (let w = 0; w <= MAX_WINDOW_MONTHS; w++) {
      const within = others.filter((r) => Math.abs(monthIndex(r.observedAt) - anchor) <= w);
      if (within.length >= MIN_BENCHMARK_ROWS) {
        benchmark = median(within.map((r) => r.unitPriceUsdKg));
        windowMonths = w;
        break;
      }
    }

    out.push({
      orgId,
      name: names.get(orgId) ?? orgId,
      latestUsdKg: latest.unitPriceUsdKg,
      observedAt: latest.observedAt,
      observations: rs.length,
      benchmarkUsdKg: benchmark,
      windowMonths,
      vsMarketPct: benchmark ? Math.round(((latest.unitPriceUsdKg - benchmark) / benchmark) * 1000) / 10 : null,
    });
  }
  // Cheapest against its market first; suppliers with no comparable market last,
  // since "unknown" is not a position on the scale.
  return out.sort((a, b) => (a.vsMarketPct ?? Infinity) - (b.vsMarketPct ?? Infinity));
}
