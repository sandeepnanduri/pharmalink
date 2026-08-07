/**
 * Candidate forecasting methods, behind one interface, so they can be ranked by
 * measured skill rather than argued about.
 *
 * Everything here is pure and dependency-free: no stats package ships with the
 * app, and the winners have to run inside a server component.
 *
 * Design notes that matter for pharmaceutical prices specifically:
 *
 *  - Prices are MULTIPLICATIVE. A $120/kg vitamin and a $6/kg bulk acid do not
 *    move in $/month, they move in %/month. Most methods therefore get a
 *    log-space variant (`inLogSpace`), and the bake-off decides whether that
 *    helps per method rather than assuming it.
 *  - Seasonality is real but weak and irregular (Chinese New Year shutdowns,
 *    monsoon logistics, year-end destocking). Seasonal methods are included as
 *    candidates, not as a foregone conclusion.
 *  - Smoothing parameters are FITTED per series by grid search, not hard-coded.
 *    The production engine's hand-set α/β were a guess; a guess that happens to
 *    win should have to prove it against fitted ones.
 */

export interface Forecaster {
  key: string;
  label: string;
  /** Smallest training length this method can be asked for. */
  minTrain: number;
  /** Fit on `train` and return exactly `h` future point forecasts. */
  fit(train: number[], h: number): number[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const last = (a: number[]) => a[a.length - 1];
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

function median(values: number[]): number {
  const v = [...values].sort((a, b) => a - b);
  if (!v.length) return 0;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/** Ordinary least-squares slope/intercept of y on t = 0..n-1. */
export function ols(y: number[]): { slope: number; intercept: number } {
  const n = y.length;
  if (n < 2) return { slope: 0, intercept: n ? y[0] : 0 };
  const tBar = (n - 1) / 2;
  const yBar = mean(y);
  let num = 0;
  let den = 0;
  for (let t = 0; t < n; t++) {
    num += (t - tBar) * (y[t] - yBar);
    den += (t - tBar) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  return { slope, intercept: yBar - slope * tBar };
}

/** Median of pairwise slopes — resistant to the outliers customs data is full of. */
export function theilSen(y: number[]): number {
  if (y.length < 2) return 0;
  const s: number[] = [];
  for (let i = 0; i < y.length; i++) for (let j = i + 1; j < y.length; j++) s.push((y[j] - y[i]) / (j - i));
  return median(s);
}

/** Simple exponential smoothing; returns the final level. */
function sesLevel(y: number[], alpha: number): number {
  let level = y[0];
  for (let i = 1; i < y.length; i++) level = alpha * y[i] + (1 - alpha) * level;
  return level;
}

/** In-sample one-step SSE for SES at a given alpha — the objective for fitting. */
function sesSse(y: number[], alpha: number): number {
  let level = y[0];
  let sse = 0;
  for (let i = 1; i < y.length; i++) {
    sse += (y[i] - level) ** 2;
    level = alpha * y[i] + (1 - alpha) * level;
  }
  return sse;
}

/** Grid search alpha in (0,1). Coarse on purpose: finer grids overfit short series. */
function fitAlpha(y: number[]): number {
  let best = 0.3;
  let bestSse = Infinity;
  for (let a = 0.05; a <= 0.95; a += 0.05) {
    const sse = sesSse(y, a);
    if (sse < bestSse) {
      bestSse = sse;
      best = a;
    }
  }
  return best;
}

interface HoltState {
  level: number;
  trend: number;
  sse: number;
}

function holtRun(y: number[], alpha: number, beta: number, phi: number): HoltState {
  let level = y[0];
  let trend = y.length > 1 ? y[1] - y[0] : 0;
  let sse = 0;
  for (let i = 1; i < y.length; i++) {
    const forecast = level + phi * trend;
    sse += (y[i] - forecast) ** 2;
    const prevLevel = level;
    level = alpha * y[i] + (1 - alpha) * forecast;
    trend = beta * (level - prevLevel) + (1 - beta) * phi * trend;
  }
  return { level, trend, sse };
}

function fitHolt(y: number[], phiGrid: number[]): { alpha: number; beta: number; phi: number } {
  let best = { alpha: 0.5, beta: 0.1, phi: phiGrid[0] };
  let bestSse = Infinity;
  for (const phi of phiGrid) {
    for (let a = 0.1; a <= 0.9; a += 0.1) {
      for (let b = 0.05; b <= 0.5; b += 0.05) {
        const { sse } = holtRun(y, a, b, phi);
        if (sse < bestSse) {
          bestSse = sse;
          best = { alpha: a, beta: b, phi };
        }
      }
    }
  }
  return best;
}

/**
 * Runs a method in log space and exponentiates back.
 *
 * Two consequences, both wanted: growth becomes additive (so a linear-trend
 * method models constant % growth), and the forecast can never go negative,
 * which the level-space trend methods have to be clamped to avoid.
 */
export function inLogSpace(f: Forecaster, key = `log-${f.key}`, label = `${f.label} (log)`): Forecaster {
  return {
    key,
    label,
    minTrain: f.minTrain,
    fit(train, h) {
      // Guard: a non-positive price is a data error, but must not produce NaN.
      const safe = train.map((v) => Math.log(Math.max(v, 1e-6)));
      return f.fit(safe, h).map((v) => Math.exp(v));
    },
  };
}

// ---------------------------------------------------------------------------
// Candidates
// ---------------------------------------------------------------------------

/** The benchmark. Everything else has to beat "next month = this month". */
export const naive: Forecaster = {
  key: 'naive',
  label: 'Naive (random walk)',
  minTrain: 1,
  fit: (train, h) => Array.from({ length: h }, () => last(train)),
};

export const historicalMean: Forecaster = {
  key: 'mean',
  label: 'Historical mean',
  minTrain: 2,
  fit: (train, h) => Array.from({ length: h }, () => mean(train)),
};

const movingAverage = (window: number): Forecaster => ({
  key: `ma${window}`,
  label: `Moving average (${window})`,
  minTrain: window,
  fit: (train, h) => {
    const m = mean(train.slice(-window));
    return Array.from({ length: h }, () => m);
  },
});

export const ma3 = movingAverage(3);
export const ma6 = movingAverage(6);

/** Median of the last 3 — a moving average that ignores a single spike. */
export const median3: Forecaster = {
  key: 'median3',
  label: 'Rolling median (3)',
  minTrain: 3,
  fit: (train, h) => {
    const m = median(train.slice(-3));
    return Array.from({ length: h }, () => m);
  },
};

/** Classic drift: the average change across the whole series. */
export const drift: Forecaster = {
  key: 'drift',
  label: 'Drift (average change)',
  minTrain: 2,
  fit: (train, h) => {
    const n = train.length;
    const slope = (last(train) - train[0]) / (n - 1);
    return Array.from({ length: h }, (_, i) => Math.max(0, last(train) + slope * (i + 1)));
  },
};

/** Robust drift — the production engine's current trend method. */
export const driftRobust: Forecaster = {
  key: 'drift-robust',
  label: 'Robust drift (Theil–Sen, damped)',
  minTrain: 3,
  fit: (train, h) => {
    const slope = theilSen(train);
    const out: number[] = [];
    let damp = 1;
    for (let i = 1; i <= h; i++) {
      damp *= 0.85;
      out.push(Math.max(0, last(train) + slope * i * damp));
    }
    return out;
  },
};

export const linearTrend: Forecaster = {
  key: 'ols',
  label: 'Linear regression',
  minTrain: 3,
  fit: (train, h) => {
    const { slope, intercept } = ols(train);
    const n = train.length;
    return Array.from({ length: h }, (_, i) => Math.max(0, intercept + slope * (n - 1 + i + 1)));
  },
};

export const ses: Forecaster = {
  key: 'ses',
  label: 'Exponential smoothing (fitted α)',
  minTrain: 3,
  fit: (train, h) => {
    const level = sesLevel(train, fitAlpha(train));
    return Array.from({ length: h }, () => level);
  },
};

export const holt: Forecaster = {
  key: 'holt',
  label: 'Holt linear (fitted)',
  minTrain: 5,
  fit: (train, h) => {
    const { alpha, beta } = fitHolt(train, [1]);
    const { level, trend } = holtRun(train, alpha, beta, 1);
    return Array.from({ length: h }, (_, i) => Math.max(0, level + trend * (i + 1)));
  },
};

export const holtDamped: Forecaster = {
  key: 'holt-damped',
  label: 'Holt damped (fitted)',
  minTrain: 5,
  fit: (train, h) => {
    const { alpha, beta, phi } = fitHolt(train, [0.8, 0.85, 0.9, 0.95, 0.98]);
    const { level, trend } = holtRun(train, alpha, beta, phi);
    const out: number[] = [];
    let damped = 0;
    for (let i = 1; i <= h; i++) {
      damped += Math.pow(phi, i);
      out.push(Math.max(0, level + damped * trend));
    }
    return out;
  },
};

/** The production engine's hand-tuned Holt — included so it must defend itself. */
export const holtFixed: Forecaster = {
  key: 'holt-fixed',
  label: 'Holt damped (hand-set α=.5 β=.25 φ=.85)',
  minTrain: 5,
  fit: (train, h) => {
    const { level, trend } = holtRun(train, 0.5, 0.25, 0.85);
    const out: number[] = [];
    let damped = 0;
    for (let i = 1; i <= h; i++) {
      damped += Math.pow(0.85, i);
      out.push(Math.max(0, level + damped * trend));
    }
    return out;
  },
};

/**
 * The Theta method — winner of the M3 competition and still a top-tier
 * benchmark. Equivalent to SES with half the linear trend added back, which is
 * why it behaves like a shrunk trend model: it captures direction without the
 * runaway extrapolation that sinks plain Holt on noisy series.
 */
export const theta: Forecaster = {
  key: 'theta',
  label: 'Theta method',
  minTrain: 4,
  fit: (train, h) => {
    const alpha = fitAlpha(train);
    const level = sesLevel(train, alpha);
    const { slope } = ols(train);
    return Array.from({ length: h }, (_, i) => Math.max(0, level + 0.5 * slope * (i + 1)));
  },
};

/** First-order autoregression around the mean — mean reversion, explicitly. */
export const ar1: Forecaster = {
  key: 'ar1',
  label: 'AR(1) mean reversion',
  minTrain: 6,
  fit: (train, h) => {
    const m = mean(train);
    let num = 0;
    let den = 0;
    for (let i = 1; i < train.length; i++) {
      num += (train[i] - m) * (train[i - 1] - m);
      den += (train[i - 1] - m) ** 2;
    }
    // Clamp to a stationary, non-explosive coefficient.
    const phi = den === 0 ? 0 : Math.max(-0.95, Math.min(0.95, num / den));
    const out: number[] = [];
    let prev = last(train);
    for (let i = 0; i < h; i++) {
      prev = m + phi * (prev - m);
      out.push(Math.max(0, prev));
    }
    return out;
  },
};

/** Same month last year — the pure seasonality hypothesis. */
export const seasonalNaive: Forecaster = {
  key: 'seasonal-naive',
  label: 'Seasonal naive (12m)',
  minTrain: 12,
  fit: (train, h) => Array.from({ length: h }, (_, i) => train[train.length - 12 + (i % 12)]),
};

/**
 * Additive Holt-Winters. Needs two full cycles to estimate seasonality at all;
 * with less it would be fitting one year of noise and calling it a season.
 */
export const holtWinters: Forecaster = {
  key: 'holt-winters',
  label: 'Holt-Winters (additive, 12m)',
  minTrain: 24,
  fit: (train, h) => {
    const m = 12;
    const alpha = 0.3;
    const beta = 0.1;
    const gamma = 0.2;
    const seasons = Math.floor(train.length / m);
    const seasonalAvg: number[] = [];
    for (let s = 0; s < seasons; s++) seasonalAvg.push(mean(train.slice(s * m, (s + 1) * m)));

    let level = seasonalAvg[0];
    let trend = (seasonalAvg[seasons - 1] - seasonalAvg[0]) / Math.max(1, (seasons - 1) * m);
    const seasonal = new Array<number>(m).fill(0);
    for (let i = 0; i < m; i++) {
      let acc = 0;
      for (let s = 0; s < seasons; s++) acc += train[s * m + i] - seasonalAvg[s];
      seasonal[i] = acc / seasons;
    }

    for (let i = 0; i < train.length; i++) {
      const idx = i % m;
      const prevLevel = level;
      level = alpha * (train[i] - seasonal[idx]) + (1 - alpha) * (level + trend);
      trend = beta * (level - prevLevel) + (1 - beta) * trend;
      seasonal[idx] = gamma * (train[i] - level) + (1 - gamma) * seasonal[idx];
    }

    return Array.from({ length: h }, (_, i) => Math.max(0, level + trend * (i + 1) + seasonal[(train.length + i) % m]));
  },
};

/**
 * Combination forecast: the median of several methods.
 *
 * Forecast combination beating its own components is one of the most durable
 * results in the literature — the errors of a level method and a trend method
 * are partly independent, so averaging cancels some of both. The median rather
 * than the mean so one method blowing up cannot drag the combination with it.
 */
export function combine(members: Forecaster[], key = 'ensemble', label = 'Ensemble (median)'): Forecaster {
  return {
    key,
    label,
    minTrain: Math.max(...members.map((m) => m.minTrain)),
    fit(train, h) {
      const all = members.filter((m) => train.length >= m.minTrain).map((m) => m.fit(train, h));
      if (!all.length) return naive.fit(train, h);
      return Array.from({ length: h }, (_, i) => median(all.map((f) => f[i])));
    },
  };
}

/**
 * Per-series automatic model selection — what the production engine does today.
 *
 * Included as a CANDIDATE rather than assumed, because picking a winner from an
 * inner backtest is not free: on short, noisy series the selection itself has
 * variance, and choosing the model that happened to fit best on ~20 folds
 * frequently loses to just always using one decent method. That trade-off is an
 * empirical question, so it gets measured like everything else.
 */
export function autoSelect(shortlist: Forecaster[], key = 'auto-select', label = 'Auto-select per series (inner backtest)'): Forecaster {
  return {
    key,
    label,
    minTrain: Math.min(...shortlist.map((m) => m.minTrain)) + 4,
    fit(train, h) {
      let best: Forecaster | null = null;
      let bestErr = Infinity;
      for (const m of shortlist) {
        if (train.length < m.minTrain + 3) continue;
        let err = 0;
        let n = 0;
        for (let k = Math.max(m.minTrain, 4); k + h <= train.length; k++) {
          const p = m.fit(train.slice(0, k), h)[h - 1];
          const a = train[k + h - 1];
          if (!Number.isFinite(p) || !(a > 0)) continue;
          err += Math.abs(a - p);
          n++;
        }
        if (n === 0) continue;
        const mae = err / n;
        if (mae < bestErr) {
          bestErr = mae;
          best = m;
        }
      }
      return (best ?? naive).fit(train, h);
    },
  };
}

/** Every candidate the bake-off ranks. */
export const CANDIDATES: Forecaster[] = [
  naive,
  historicalMean,
  ma3,
  ma6,
  median3,
  drift,
  driftRobust,
  linearTrend,
  ses,
  holt,
  holtDamped,
  holtFixed,
  theta,
  ar1,
  seasonalNaive,
  holtWinters,
  inLogSpace(drift),
  inLogSpace(driftRobust),
  inLogSpace(linearTrend),
  inLogSpace(ses),
  inLogSpace(holtDamped),
  inLogSpace(theta),
  inLogSpace(ar1),
  combine([naive, ses, theta, holtDamped], 'ens-4', 'Ensemble: naive+SES+Theta+Holt'),
  combine([ses, theta, inLogSpace(theta), driftRobust], 'ens-trend', 'Ensemble: SES+Theta+logTheta+robust drift'),
  combine([naive, ses, median3], 'ens-level', 'Ensemble: level methods only'),
  autoSelect([naive, driftRobust, holtFixed], 'auto-production', 'Auto-select (production shortlist: naive/drift/Holt)'),
  autoSelect([naive, ses, theta, inLogSpace(ses), inLogSpace(theta), holtDamped], 'auto-wide', 'Auto-select (wide shortlist)'),
];
