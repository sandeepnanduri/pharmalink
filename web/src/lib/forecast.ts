/**
 * Price forecasting — pure, deterministic, unit-tested. No DB, no network.
 *
 * Honesty rules this module enforces in code, not in a disclaimer:
 *
 *  1. A forecast is only produced from enough real observations
 *     (`MIN_HISTORY` months). Below that it returns `insufficient_data`
 *     instead of a confident-looking line through three points.
 *  2. Prediction intervals are EARNED from the model's own measured error, not
 *     drawn from an assumed normal curve. If it has been wrong by 30%
 *     historically, the band is 30% wide and says so.
 *  3. Central tendency is a weighted MEDIAN, not a mean. Customs unit values
 *     and one-off spot quotes produce outliers that would drag a mean around.
 *
 * ## Why this method, and not a fancier one
 *
 * Every choice below was decided by `scripts/model-bakeoff.ts`, which ranks 28
 * candidate methods by rolling-origin error on the real captured history
 * (12 molecules x ~75 months). Relative to the naive "next month = this month"
 * benchmark, measured on identical folds:
 *
 *     log-space SES (fitted alpha)   0.798   <- this module
 *     log-space Theta                0.801      (statistically tied)
 *     auto-select from a shortlist   0.810
 *     hand-set damped Holt           0.900      (the previous implementation)
 *     naive benchmark                1.000
 *     Theil-Sen drift                1.003
 *     Holt-Winters (seasonal)        1.042
 *     seasonal naive                 1.271
 *
 * Three findings drive the design, and each contradicts an obvious guess:
 *
 *  - TREND EXTRAPOLATION LOSES. Every drift/regression/Holt-linear variant
 *    scored at or worse than naive. Customs unit values are mean-reverting
 *    noise around a slowly moving level, not a trend, so projecting last
 *    quarter's direction forward reliably adds error.
 *  - THERE IS NO USABLE SEASONALITY. Seasonal naive and Holt-Winters were the
 *    two WORST methods tested over 75 months. The Chinese-New-Year and
 *    year-end-destocking effects are real trade lore but do not survive as a
 *    stable 12-month cycle in these series.
 *  - PICKING A MODEL PER MOLECULE MADE THINGS WORSE (0.810-0.934 vs 0.798 for
 *    just always using one method). Selection on ~20 folds is mostly selection
 *    noise. So this module does NOT choose a model any more; the fitted alpha
 *    is the only thing that adapts per series — and because SES with alpha=1 IS
 *    naive and alpha->0 is the historical mean, fitting alpha already spans the
 *    useful range without paying the variance cost of discrete selection.
 *
 * Evidence base: one reporter (India), 12 molecules, ~75 months, h=1. The gap
 * to the previous implementation (100% of series) is solid; the gap between the
 * top two methods is not, and either would be defensible.
 */

/** A month bucket of the price history. `period` is "YYYY-MM". */
export interface SeriesPoint {
  period: string;
  value: number;
  /** How many raw observations landed in this month. */
  n: number;
  /** Sum of evidence weights behind `value`. */
  weight: number;
}

/** A single observation before it is bucketed into a month. */
export interface RawObservation {
  observedAt: Date;
  unitPriceUsdKg: number;
  quantityKg?: number | null;
  weight?: number;
}

/**
 * Only one model ships now. The union is kept (rather than dropped) because
 * `PriceForecast` rows issued before the bake-off recorded the old names, and
 * the scoreboard must still be able to render its own history.
 */
export type ForecastModel = 'ses-log' | 'naive' | 'drift' | 'holt';
export type Confidence = 'insufficient' | 'low' | 'medium' | 'high';

export interface ForecastPoint {
  period: string;
  p10: number;
  p50: number;
  p90: number;
}

export interface Accuracy {
  /** Mean absolute percentage error across backtest folds. */
  mape: number;
  /** Mean absolute error, USD/kg. */
  mae: number;
  /** Share of folds whose actual fell inside the p10–p90 band, 0..1. */
  coverage: number;
  folds: number;
}

export interface ForecastResult {
  status: 'ok' | 'insufficient_data';
  /** Months of real history behind this. */
  history: SeriesPoint[];
  observations: number;
  model: ForecastModel | null;
  /** Fitted smoothing constant, null when no forecast was produced. */
  alpha?: number;
  points: ForecastPoint[];
  accuracy: Accuracy | null;
  confidence: Confidence;
  /** Robust (Theil–Sen) trend, % of the last level per month. */
  trendPctPerMonth: number;
  /** Median absolute month-on-month move, in percent. */
  volatilityPct: number;
  /** Why this result is what it is — surfaced to the user verbatim. */
  notes: string[];
}

/** Fewer months than this and we refuse to forecast at all. */
export const MIN_HISTORY = 6;
/**
 * Nominal coverage of the published band.
 *
 * Conformal gives a one-sided guarantee: coverage >= this level, not equal to
 * it. With many folds it lands close (79.8% measured in the bake-off on ~60
 * folds); with the ~20 folds a two-year history affords, the finite-sample
 * correction makes it conservative (~90% measured). Both are honest; the UI
 * shows the achieved figure rather than this one.
 */
export const INTERVAL_LEVEL = 0.8;
// ---------------------------------------------------------------------------
// Small statistics kit (kept local — no runtime dependency for four functions)
// ---------------------------------------------------------------------------

export function median(values: number[]): number {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (v.length === 0) return 0;
  const mid = v.length >> 1;
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

/**
 * Quantile by linear interpolation on an ALREADY SORTED ascending array.
 * (Type-7, the definition R and numpy default to.)
 */
export function quantileSorted(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * Math.min(1, Math.max(0, q));
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/**
 * Weighted median: the value where cumulative weight crosses half the total.
 * Used instead of a weighted mean so a single 10-tonne customs line cannot
 * define the market price on its own.
 */
export function weightedMedian(items: { value: number; weight: number }[]): number {
  const valid = items.filter((i) => Number.isFinite(i.value) && i.weight > 0).sort((a, b) => a.value - b.value);
  if (valid.length === 0) return 0;
  const total = valid.reduce((a, i) => a + i.weight, 0);
  let acc = 0;
  for (let i = 0; i < valid.length; i++) {
    acc += valid[i].weight;
    if (acc >= total / 2) {
      // Exactly on the boundary with a neighbour left: average the two, so an
      // even split of two observations returns their midpoint rather than the
      // lower one.
      if (acc === total / 2 && i + 1 < valid.length) return (valid[i].value + valid[i + 1].value) / 2;
      return valid[i].value;
    }
  }
  return valid[valid.length - 1].value;
}

/**
 * Theil–Sen slope: the median of all pairwise slopes. Robust to up to ~29% of
 * points being outliers, which ordinary least squares is not — and customs
 * unit-value series are full of outliers.
 */
export function theilSenSlope(values: number[]): number {
  if (values.length < 2) return 0;
  const slopes: number[] = [];
  for (let i = 0; i < values.length; i++) {
    for (let j = i + 1; j < values.length; j++) {
      slopes.push((values[j] - values[i]) / (j - i));
    }
  }
  return median(slopes);
}

// ---------------------------------------------------------------------------
// Month bucketing
// ---------------------------------------------------------------------------

/** "YYYY-MM" in UTC — the canonical bucket key everywhere in this module. */
export function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** First instant of a "YYYY-MM" bucket, in UTC. */
export function monthStart(period: string): Date {
  const [y, m] = period.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1));
}

/** The month `offset` months after `period` ("2026-11" + 3 = "2027-02"). */
export function addMonths(period: string, offset: number): string {
  const d = monthStart(period);
  d.setUTCMonth(d.getUTCMonth() + offset);
  return monthKey(d);
}

/** Whole months between two "YYYY-MM" keys (b - a). */
export function monthDiff(a: string, b: string): number {
  const [ay, am] = a.split('-').map(Number);
  const [by, bm] = b.split('-').map(Number);
  return (by - ay) * 12 + (bm - am);
}

/**
 * Buckets raw observations into monthly points using a volume- and
 * evidence-weighted median.
 *
 * Gaps are NOT filled. A month with no trade is a month with no price, and
 * interpolating one would invent an observation the forecast then treats as
 * real. `contiguousTail` exists for callers that need an unbroken run.
 */
export function buildMonthlySeries(observations: RawObservation[]): SeriesPoint[] {
  const buckets = new Map<string, { value: number; weight: number }[]>();
  for (const o of observations) {
    if (!Number.isFinite(o.unitPriceUsdKg) || o.unitPriceUsdKg <= 0) continue;
    const key = monthKey(o.observedAt);
    // Volume weighting is sub-linear (√kg): a 1,000 kg lot is better evidence
    // than a 1 kg lot, but not a thousand times better.
    const volume = o.quantityKg && o.quantityKg > 0 ? Math.sqrt(o.quantityKg) : 1;
    const weight = Math.max(0, o.weight ?? 1) * volume;
    const arr = buckets.get(key) ?? [];
    arr.push({ value: o.unitPriceUsdKg, weight });
    buckets.set(key, arr);
  }
  return [...buckets.entries()]
    .map(([period, items]) => ({
      period,
      value: Math.round(weightedMedian(items) * 100) / 100,
      n: items.length,
      weight: Math.round(items.reduce((a, i) => a + i.weight, 0) * 100) / 100,
    }))
    .sort((a, b) => a.period.localeCompare(b.period));
}

/**
 * The LONGEST run of consecutive months in the series.
 *
 * Forecasting across a six-month hole would silently treat old prices as
 * adjacent to new ones, so gaps must break the series somewhere. But taking the
 * run that ends at the newest point is wrong in the common case: official trade
 * statistics publish two months in arrears, so a single fresh platform quote
 * arrives *after* a gap and would discard two years of customs history behind
 * it. The longest run keeps the evidence; `strandedTail` reports what it cost.
 *
 * Ties go to the more recent run — same length, better information.
 */
export function longestContiguousRun(series: SeriesPoint[]): SeriesPoint[] {
  if (series.length === 0) return [];
  let best: SeriesPoint[] = [];
  let current: SeriesPoint[] = [series[0]];
  for (let i = 1; i < series.length; i++) {
    if (monthDiff(series[i - 1].period, series[i].period) === 1) {
      current.push(series[i]);
    } else {
      if (current.length >= best.length) best = current;
      current = [series[i]];
    }
  }
  return current.length >= best.length ? current : best;
}

/** Observations newer than the run being used — excluded, but not hidden. */
export function strandedTail(series: SeriesPoint[], run: SeriesPoint[]): SeriesPoint[] {
  const lastUsed = run.at(-1)?.period;
  if (!lastUsed) return [];
  return series.filter((p) => p.period > lastUsed);
}

// ---------------------------------------------------------------------------
// The model: simple exponential smoothing in log space, alpha fitted per series
// ---------------------------------------------------------------------------

/** One-step SSE for SES at a given alpha — the objective the fit minimises. */
function sesSse(y: number[], alpha: number): number {
  let level = y[0];
  let sse = 0;
  for (let i = 1; i < y.length; i++) {
    sse += (y[i] - level) ** 2;
    level = alpha * y[i] + (1 - alpha) * level;
  }
  return sse;
}

/**
 * Fits the smoothing constant by coarse grid search.
 *
 * The grid is deliberately coarse (0.05 steps): a finer search on 12–75 points
 * chases noise, and the SSE surface is flat enough that the difference between
 * alpha=0.42 and alpha=0.45 is meaningless.
 *
 * The endpoints are the reason no model selection is needed. alpha near 1 makes
 * SES equal to the naive forecast; alpha near 0 makes it the historical mean.
 * Fitting alpha therefore slides continuously between "trust the latest print"
 * and "trust the long-run level", which is exactly the choice discrete model
 * selection was trying to make — without the selection variance.
 */
export function fitAlpha(y: number[]): number {
  let best = 0.3;
  let bestSse = Infinity;
  for (let a = 0.05; a <= 0.95 + 1e-9; a += 0.05) {
    const sse = sesSse(y, a);
    if (sse < bestSse) {
      bestSse = sse;
      best = Math.round(a * 100) / 100;
    }
  }
  return best;
}

/**
 * The forecast itself: SES on log prices, exponentiated back.
 *
 * Log space because prices move multiplicatively — a $120/kg vitamin and a
 * $6/kg acid both move in percent, not dollars. It also makes a negative
 * forecast structurally impossible rather than something to clamp away.
 */
function forecastLevels(train: number[], horizon: number): { levels: number[]; alpha: number } {
  const logs = train.map((v) => Math.log(Math.max(v, 1e-6)));
  const alpha = fitAlpha(logs);
  let level = logs[0];
  for (let i = 1; i < logs.length; i++) level = alpha * logs[i] + (1 - alpha) * level;
  const value = Math.exp(level);
  // SES has no trend term, so the projection is flat across the horizon. That
  // is a finding, not an omission: every trend variant tested scored worse
  // than doing nothing (see the header).
  return { levels: Array.from({ length: horizon }, () => value), alpha };
}

// ---------------------------------------------------------------------------
// Backtesting
// ---------------------------------------------------------------------------

export interface BacktestResult {
  /** Mean absolute percentage error across folds. */
  mape: number;
  /** Mean absolute error, USD/kg. */
  mae: number;
  folds: number;
  /**
   * One (actual, predicted) pair per fold.
   *
   * Kept as PAIRS rather than pre-reduced errors because the interval method
   * needs the ratio actual/predicted, and a percentage or absolute error throws
   * away the information needed to reconstruct it.
   */
  residuals: { actual: number; predicted: number }[];
}

/** Smallest training window a backtest fold may use. */
const MIN_TRAIN = 4;

/**
 * Rolling-origin (expanding-window) backtest: train on the first k months,
 * predict month k+1, compare to what actually happened, then k+1, and so on.
 *
 * This used to also CHOOSE the model. It no longer does — the bake-off showed
 * per-series selection costing accuracy — so its only job now is to measure
 * honestly how wrong this method has been, which feeds both the reported
 * accuracy and the width of the prediction band.
 */
export function backtestModel(values: number[]): BacktestResult {
  const residuals: { actual: number; predicted: number }[] = [];
  const absErrors: number[] = [];
  const pctErrors: number[] = [];

  for (let k = MIN_TRAIN; k < values.length; k++) {
    const predicted = forecastLevels(values.slice(0, k), 1).levels[0];
    const actual = values[k];
    if (!(actual > 0) || !Number.isFinite(predicted)) continue;
    residuals.push({ actual, predicted });
    absErrors.push(Math.abs(actual - predicted));
    pctErrors.push(Math.abs((actual - predicted) / actual) * 100);
  }

  const folds = residuals.length;
  return {
    folds,
    residuals,
    mape: folds ? Math.round((pctErrors.reduce((a, e) => a + e, 0) / folds) * 10) / 10 : 0,
    mae: folds ? Math.round((absErrors.reduce((a, e) => a + e, 0) / folds) * 100) / 100 : 0,
  };
}

/**
 * Split-conformal prediction band, multiplicative.
 *
 * Takes the (1-α) quantile of |log(actual/predicted)| over past folds and
 * applies it as a RATIO: the band runs point÷k to point×k.
 *
 * Chosen by measurement (`scripts/model-bakeoff.ts`, interval section) — at a
 * nominal 80% it achieved 79.8% empirical coverage against 75.2% for the
 * additive percentage-quantile method it replaced, at a comparable width.
 *
 * The structural reason it is the right shape: an additive band on a volatile
 * molecule clamps its lower bound at zero, and a band from $0 upward contains
 * every possible outcome — so it scores 100% coverage while saying nothing.
 * 17% of the old method's bands were degenerate that way. A multiplicative band
 * cannot be: dividing a positive price by a finite factor stays positive.
 */
/**
 * How often the band ACTUALLY contained the truth, measured prospectively.
 *
 * The subtlety this exists to avoid: scoring each fold against a band built
 * from every residual — including that fold's own — is circular. A conformal
 * band is by construction the q-quantile of the residuals fed to it, so
 * in-sample "coverage" just returns q for every series, however good or bad the
 * model is. The first version of this did exactly that and reported a
 * suspiciously identical 85% for all twelve molecules.
 *
 * Here each fold is judged against a band built only from residuals BEFORE it,
 * which is the same information the live forecast has. Returns 0 when there is
 * not enough history to make the claim at all.
 */
export function prospectiveCoverage(residuals: { actual: number; predicted: number }[], level: number): number {
  const MIN_PRIOR = 5;
  let inBand = 0;
  let tested = 0;
  for (let i = MIN_PRIOR; i < residuals.length; i++) {
    const band = conformalBand(residuals[i].predicted, residuals.slice(0, i), level);
    tested++;
    if (residuals[i].actual >= band.lower && residuals[i].actual <= band.upper) inBand++;
  }
  return tested === 0 ? 0 : Math.round((inBand / tested) * 100) / 100;
}

export function conformalBand(point: number, residuals: { actual: number; predicted: number }[], level: number) {
  const ratios = residuals
    .filter((r) => r.actual > 0 && r.predicted > 0)
    .map((r) => Math.abs(Math.log(r.actual / r.predicted)))
    .sort((a, b) => a - b);
  if (ratios.length === 0) return { lower: point, upper: point };
  // Finite-sample conformal correction: ceil((n+1)(1-α))/n, not plain (1-α).
  const n = ratios.length;
  const q = Math.min(1, Math.ceil((n + 1) * level) / n);
  const k = Math.exp(quantileSorted(ratios, q));
  return { lower: point / k, upper: point * k };
}

/**
 * Confidence is a function of how much history there is and how wrong the model
 * has actually been — never of how nice the chart looks.
 */
export function gradeConfidence(months: number, folds: number, mape: number): Confidence {
  if (months < MIN_HISTORY) return 'insufficient';
  if (folds < 3 || mape > 25) return 'low';
  if (months >= 12 && folds >= 6 && mape <= 10) return 'high';
  return 'medium';
}

// ---------------------------------------------------------------------------
// The forecast
// ---------------------------------------------------------------------------

export interface ForecastOptions {
  /** Months ahead to project. Default 3. */
  horizon?: number;
}

export function forecast(observations: RawObservation[], opts: ForecastOptions = {}): ForecastResult {
  const horizon = Math.max(1, Math.min(12, opts.horizon ?? 3));
  const full = buildMonthlySeries(observations);
  const series = longestContiguousRun(full);
  const stranded = strandedTail(full, series);
  const values = series.map((p) => p.value);
  const notes: string[] = [];

  if (full.length > series.length) {
    notes.push(`Using the longest unbroken run of ${series.length} months; the rest of the history has gaps and was excluded.`);
  }
  if (stranded.length > 0) {
    notes.push(
      `${stranded.length} more recent observation${stranded.length === 1 ? '' : 's'} (from ${stranded[0].period}) sit after a reporting gap and are not projected from.`,
    );
  }

  if (series.length < MIN_HISTORY) {
    return {
      status: 'insufficient_data',
      history: series,
      observations: observations.length,
      model: null,
      points: [],
      accuracy: null,
      confidence: 'insufficient',
      trendPctPerMonth: 0,
      volatilityPct: 0,
      notes: [
        ...notes,
        `A forecast needs at least ${MIN_HISTORY} consecutive months of price data; this molecule has ${series.length}.`,
      ],
    };
  }

  const result = backtestModel(values);
  const { levels, alpha } = forecastLevels(values, horizon);

  // Bands come from the model's own measured errors via split-conformal in log
  // space, widened with horizon as √h (a random-walk assumption — the one
  // modelling assumption made here, and it is stated in the notes).
  const lastPeriod = series[series.length - 1].period;
  const points: ForecastPoint[] = levels.map((p50, i) => {
    const widen = Math.sqrt(i + 1);
    const base = conformalBand(p50, result.residuals, INTERVAL_LEVEL);
    // Scale the ratio, not the dollar width, so the band stays multiplicative.
    const k = p50 > 0 ? Math.pow(base.upper / p50, widen) : 1;
    return {
      period: addMonths(lastPeriod, i + 1),
      p50: Math.round(p50 * 100) / 100,
      p10: Math.round((p50 / k) * 100) / 100,
      p90: Math.round(p50 * k * 100) / 100,
    };
  });

  const coverage = prospectiveCoverage(result.residuals, INTERVAL_LEVEL);

  const last = values[values.length - 1];
  const slope = theilSenSlope(values);
  const moves: number[] = [];
  for (let i = 1; i < values.length; i++) {
    if (values[i - 1] > 0) moves.push(Math.abs((values[i] - values[i - 1]) / values[i - 1]) * 100);
  }

  const confidence = gradeConfidence(series.length, result.folds, result.mape);
  notes.push(
    `Exponential smoothing on log prices, fitted α = ${alpha.toFixed(2)} (α→1 tracks the latest print, α→0 tracks the long-run level).`,
  );
  notes.push(
    'The projection is flat because no trend or seasonal method beat a level method on this data — see the model bake-off, not an omission.',
  );
  notes.push(
    `Bands are a split-conformal interval from the model's ${result.folds} historical one-month errors, applied multiplicatively and widened by √horizon. Conformal guarantees AT LEAST ${Math.round(
      INTERVAL_LEVEL * 100,
    )}% coverage, and on few folds it is deliberately conservative — the measured figure above is what it actually achieved.`,
  );

  return {
    status: 'ok',
    history: series,
    observations: observations.length,
    model: 'ses-log',
    alpha,
    points,
    accuracy: { mape: result.mape, mae: result.mae, coverage, folds: result.folds },
    confidence,
    trendPctPerMonth: last > 0 ? Math.round((slope / last) * 1000) / 10 : 0,
    volatilityPct: Math.round(median(moves) * 10) / 10,
    notes,
  };
}

/**
 * Scores an already-issued forecast against what actually happened. Powers the
 * public accuracy scoreboard — the thing that makes the forecast falsifiable.
 */
export function scoreForecast(predicted: { p10: number; p50: number; p90: number }, actual: number) {
  if (!(actual > 0)) return null;
  return {
    actual,
    errorPct: Math.round(((predicted.p50 - actual) / actual) * 1000) / 10,
    withinBand: actual >= predicted.p10 && actual <= predicted.p90,
  };
}
