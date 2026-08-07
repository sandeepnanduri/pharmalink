/**
 * Prediction-interval methods, ranked the same way the point forecasts are.
 *
 * An interval is a falsifiable claim: "80% of the time the truth lands in
 * here". So it gets measured on two axes at once, and both matter:
 *
 *   COVERAGE — what fraction actually landed inside. 80% nominal should give
 *              ~80% empirical. Under-coverage is overconfidence; large
 *              over-coverage means the band is uselessly wide.
 *   WIDTH    — of two methods with correct coverage, the narrower is better.
 *
 * Reporting coverage alone is how a "100% accurate" band of $0–$∞ gets shipped.
 * The production engine's first version had exactly that failure mode: its
 * additive band clamped at zero, so a wildly uncertain molecule got a $0
 * lower bound and every outcome counted as a hit.
 */

export interface Band {
  lower: number;
  upper: number;
}

export interface IntervalMethod {
  key: string;
  label: string;
  /**
   * Build a band around `point` from the residual record.
   *
   * `residuals` are past one-step-ahead errors as (actual, predicted) pairs, so
   * a method can work in whatever space it likes — absolute, signed, or ratio.
   */
  band(point: number, residuals: { actual: number; predicted: number }[], level: number): Band;
}

function quantileSorted(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * Math.min(1, Math.max(0, q));
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** The production engine's original method: empirical quantiles of % error. */
export const empiricalPercent: IntervalMethod = {
  key: 'empirical-pct',
  label: 'Empirical percentage-error quantiles',
  band(point, residuals, level) {
    const tail = (1 - level) / 2;
    const errs = residuals.map((r) => ((r.actual - r.predicted) / r.actual) * 100).sort((a, b) => a - b);
    const lo = quantileSorted(errs, tail);
    const hi = quantileSorted(errs, 1 - tail);
    return { lower: Math.max(0, point * (1 + lo / 100)), upper: point * (1 + hi / 100) };
  },
};

/** Textbook Gaussian band from the residual standard deviation. */
export const gaussian: IntervalMethod = {
  key: 'gaussian',
  label: 'Gaussian (residual σ)',
  band(point, residuals, level) {
    const errs = residuals.map((r) => r.actual - r.predicted);
    const mean = errs.reduce((a, b) => a + b, 0) / errs.length;
    const variance = errs.reduce((a, e) => a + (e - mean) ** 2, 0) / Math.max(1, errs.length - 1);
    const sd = Math.sqrt(variance);
    // z for a two-sided level: 80% -> 1.2816, 90% -> 1.6449, 95% -> 1.96
    const z = level >= 0.95 ? 1.96 : level >= 0.9 ? 1.6449 : 1.2816;
    return { lower: Math.max(0, point - z * sd), upper: point + z * sd };
  },
};

/**
 * Split-conformal: take the (1-α) quantile of past ABSOLUTE errors and put it
 * symmetrically around the point forecast.
 *
 * Distribution-free, and with exchangeable residuals it has a finite-sample
 * coverage guarantee — no normality assumption, which matters because these
 * residuals are visibly fat-tailed.
 */
export const conformalAbsolute: IntervalMethod = {
  key: 'conformal-abs',
  label: 'Split-conformal (absolute)',
  band(point, residuals, level) {
    const abs = residuals.map((r) => Math.abs(r.actual - r.predicted)).sort((a, b) => a - b);
    // The finite-sample correction: ceil((n+1)(1-α))/n rather than plain (1-α).
    const n = abs.length;
    const q = Math.min(1, Math.ceil((n + 1) * level) / n);
    const w = quantileSorted(abs, q);
    return { lower: Math.max(0, point - w), upper: point + w };
  },
};

/**
 * Conformal in log space: the quantile is taken over |log(actual/predicted)|,
 * so the band is MULTIPLICATIVE — point ÷ k to point × k.
 *
 * This is the one that structurally cannot produce a zero or negative lower
 * bound, and it matches how prices actually behave: a volatile molecule is
 * "±40%", not "±$18".
 */
export const conformalRatio: IntervalMethod = {
  key: 'conformal-ratio',
  label: 'Split-conformal (multiplicative / log)',
  band(point, residuals, level) {
    const ratios = residuals
      .filter((r) => r.actual > 0 && r.predicted > 0)
      .map((r) => Math.abs(Math.log(r.actual / r.predicted)))
      .sort((a, b) => a - b);
    if (!ratios.length) return { lower: point, upper: point };
    const n = ratios.length;
    const q = Math.min(1, Math.ceil((n + 1) * level) / n);
    const k = Math.exp(quantileSorted(ratios, q));
    return { lower: point / k, upper: point * k };
  },
};

/**
 * Asymmetric log-space quantiles: separate lower and upper tails of the SIGNED
 * log ratio. Prices spike upward more often than they collapse downward, so a
 * symmetric band is the wrong shape even when its coverage is right.
 */
export const conformalRatioAsymmetric: IntervalMethod = {
  key: 'conformal-ratio-asym',
  label: 'Log-space quantiles (asymmetric)',
  band(point, residuals, level) {
    const tail = (1 - level) / 2;
    const logs = residuals
      .filter((r) => r.actual > 0 && r.predicted > 0)
      .map((r) => Math.log(r.actual / r.predicted))
      .sort((a, b) => a - b);
    if (!logs.length) return { lower: point, upper: point };
    return { lower: point * Math.exp(quantileSorted(logs, tail)), upper: point * Math.exp(quantileSorted(logs, 1 - tail)) };
  },
};

export const INTERVAL_METHODS: IntervalMethod[] = [
  empiricalPercent,
  gaussian,
  conformalAbsolute,
  conformalRatio,
  conformalRatioAsymmetric,
];

/**
 * Pinball (quantile) loss — the proper scoring rule for a quantile forecast.
 * Rewards a narrow band and punishes a miss, so it cannot be gamed by widening
 * the interval the way raw coverage can.
 */
export function pinball(actual: number, quantile: number, tau: number): number {
  return actual >= quantile ? tau * (actual - quantile) : (1 - tau) * (quantile - actual);
}

/** Combined interval score at `level`: both tails, lower is better. */
export function intervalScore(actual: number, band: Band, level: number): number {
  const tail = (1 - level) / 2;
  return pinball(actual, band.lower, tail) + pinball(actual, band.upper, 1 - tail);
}
