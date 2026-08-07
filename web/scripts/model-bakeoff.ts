/**
 * Model bake-off: rank every candidate forecaster by measured out-of-sample
 * skill on the real captured data.
 *
 * Metric is RELATIVE MAE: each method's mean absolute error divided by the
 * naive benchmark's error on the identical folds of the identical series. Naive
 * therefore scores exactly 1.000 and every other number reads directly as
 * "fraction of the benchmark's error" — 0.90 means 10% less error than
 * "next month = this month".
 *
 * Why not MAPE as the headline: it cannot be averaged across these series (a
 * $6/kg acid and a $122/kg vitamin sit on different scales) and it is
 * asymmetric — it punishes over-forecasting harder than under-forecasting,
 * which quietly biases any ranking toward methods that predict low. It is
 * reported alongside for readability only.
 *
 * Two things are ranked here, not one: the FORECASTING METHOD and the SERIES
 * CONSTRUCTION (how raw customs rows become a monthly price). The second turns
 * out to matter as much as the first, which is why it is a dimension of the
 * experiment rather than an assumption baked in before it starts.
 *
 * Run:  npx tsx scripts/model-bakeoff.ts [--deep] [--h 1|3]
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { CANDIDATES, type Forecaster } from '../src/lib/models';
import { INTERVAL_METHODS, intervalScore } from '../src/lib/intervals';
import { HS_BY_CAS, comtradeUnitValue, customsWeight, type ComtradeRow } from '../src/lib/market-data';

const FIXTURES = join(__dirname, '..', 'prisma', 'fixtures');
const deep = process.argv.includes('--deep');
const H = Number(process.argv[process.argv.indexOf('--h') + 1]) || 1;

interface Obs {
  period: string;
  value: number;
  weight: number;
  qty: number;
  reporter: string;
}

interface Series {
  molecule: string;
  construction: string;
  points: number[];
  periods: string[];
}

// ---------------------------------------------------------------------------
// Load raw observations
// ---------------------------------------------------------------------------

function loadObservations(): Map<string, Obs[]> {
  const file = deep ? 'comtrade-history.json' : 'comtrade.json';
  const path = join(FIXTURES, file);
  if (!existsSync(path)) throw new Error(`missing fixture ${path} — run the capture script first`);
  const raw = JSON.parse(readFileSync(path, 'utf8')) as {
    rows: (ComtradeRow & { reporterIso: string })[];
  };

  const byMolecule = new Map<string, Obs[]>();
  for (const row of raw.rows) {
    const mappings = HS_BY_CAS.filter((m) => m.hs6 === row.cmdCode);
    if (!mappings.length) continue;
    const n = comtradeUnitValue(row);
    if ('rejected' in n) continue;
    for (const m of mappings) {
      const arr = byMolecule.get(m.name) ?? [];
      arr.push({
        period: `${row.period.slice(0, 4)}-${row.period.slice(4, 6)}`,
        value: n.unitPriceUsdKg,
        weight: customsWeight(m.specificity),
        qty: n.quantityKg,
        reporter: row.reporterIso,
      });
      byMolecule.set(m.name, arr);
    }
  }
  return byMolecule;
}

// ---------------------------------------------------------------------------
// Series construction variants — the second thing being ranked
// ---------------------------------------------------------------------------

function med(a: number[]): number {
  const v = [...a].sort((x, y) => x - y);
  if (!v.length) return 0;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

function weightedMedian(items: { value: number; weight: number }[]): number {
  const v = items.filter((i) => i.weight > 0).sort((a, b) => a.value - b.value);
  if (!v.length) return 0;
  const total = v.reduce((s, i) => s + i.weight, 0);
  let acc = 0;
  for (const i of v) {
    acc += i.weight;
    if (acc >= total / 2) return i.value;
  }
  return v[v.length - 1].value;
}

type Construction = (obs: Obs[]) => Map<string, number>;

const CONSTRUCTIONS: Record<string, Construction> = {
  /** What production does today: √kg-weighted median across everything. */
  'wmedian-sqrtkg': (obs) => {
    const buckets = new Map<string, { value: number; weight: number }[]>();
    for (const o of obs) {
      const arr = buckets.get(o.period) ?? [];
      arr.push({ value: o.value, weight: o.weight * (o.qty > 0 ? Math.sqrt(o.qty) : 1) });
      buckets.set(o.period, arr);
    }
    return new Map([...buckets].map(([p, items]) => [p, weightedMedian(items)]));
  },

  /** Plain median across reporters — ignores volume entirely. */
  'median-plain': (obs) => {
    const buckets = new Map<string, number[]>();
    for (const o of obs) buckets.set(o.period, [...(buckets.get(o.period) ?? []), o.value]);
    return new Map([...buckets].map(([p, v]) => [p, med(v)]));
  },

  /** Volume-weighted MEAN — i.e. total value ÷ total kg, a true unit value. */
  'value-over-weight': (obs) => {
    const buckets = new Map<string, { v: number; k: number }>();
    for (const o of obs) {
      const b = buckets.get(o.period) ?? { v: 0, k: 0 };
      b.v += o.value * o.qty;
      b.k += o.qty;
      buckets.set(o.period, b);
    }
    return new Map([...buckets].map(([p, b]) => [p, b.k > 0 ? b.v / b.k : 0]));
  },

  /** Single largest exporter only — one consistent market, no cross-country mixing. */
  'india-only': (obs) => {
    const buckets = new Map<string, { value: number; weight: number }[]>();
    for (const o of obs) {
      if (o.reporter !== 'IN') continue;
      const arr = buckets.get(o.period) ?? [];
      arr.push({ value: o.value, weight: o.qty > 0 ? Math.sqrt(o.qty) : 1 });
      buckets.set(o.period, arr);
    }
    return new Map([...buckets].map(([p, items]) => [p, weightedMedian(items)]));
  },
};

/** Longest run of consecutive months, as production requires. */
function longestRun(periods: string[], values: number[]): { periods: string[]; values: number[] } {
  const diff = (a: string, b: string) => {
    const [ay, am] = a.split('-').map(Number);
    const [by, bm] = b.split('-').map(Number);
    return (by - ay) * 12 + (bm - am);
  };
  let best: number[] = [];
  let cur: number[] = [0];
  for (let i = 1; i < periods.length; i++) {
    if (diff(periods[i - 1], periods[i]) === 1) cur.push(i);
    else {
      if (cur.length >= best.length) best = cur;
      cur = [i];
    }
  }
  const idx = cur.length >= best.length ? cur : best;
  return { periods: idx.map((i) => periods[i]), values: idx.map((i) => values[i]) };
}

function buildSeries(byMolecule: Map<string, Obs[]>): Series[] {
  const out: Series[] = [];
  for (const [molecule, obs] of byMolecule) {
    for (const [construction, fn] of Object.entries(CONSTRUCTIONS)) {
      const map = fn(obs);
      const sorted = [...map.entries()].filter(([, v]) => v > 0).sort((a, b) => a[0].localeCompare(b[0]));
      if (sorted.length < 20) continue;
      const run = longestRun(
        sorted.map(([p]) => p),
        sorted.map(([, v]) => v),
      );
      if (run.values.length < 20) continue;
      out.push({ molecule, construction, points: run.values, periods: run.periods });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Rolling-origin evaluation
// ---------------------------------------------------------------------------

interface Score {
  /** Mean absolute error over the folds, in USD/kg. */
  mae: number;
  mape: number;
  folds: number;
}

function evaluate(series: number[], model: Forecaster, h: number, minTrain: number): Score | null {
  const absErrors: number[] = [];
  const pctErrors: number[] = [];
  const start = Math.max(minTrain, model.minTrain);
  if (series.length < start + h) return null;

  for (let k = start; k + h <= series.length; k++) {
    const train = series.slice(0, k);
    let pred: number[];
    try {
      pred = model.fit(train, h);
    } catch {
      return null;
    }
    const actual = series[k + h - 1];
    const p = pred[h - 1];
    if (!Number.isFinite(p) || !(actual > 0)) return null;
    absErrors.push(Math.abs(actual - p));
    pctErrors.push(Math.abs((actual - p) / actual) * 100);
  }
  if (!absErrors.length) return null;

  return {
    mae: absErrors.reduce((a, b) => a + b, 0) / absErrors.length,
    mape: pctErrors.reduce((a, b) => a + b, 0) / pctErrors.length,
    folds: absErrors.length,
  };
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const byMolecule = loadObservations();
const allSeries = buildSeries(byMolecule);

console.log(`\nData: ${deep ? 'DEEP history' : 'standard snapshot'}   horizon: ${H} month(s)`);
console.log(`Molecules: ${byMolecule.size}   series (molecule x construction): ${allSeries.length}`);
const lengths = allSeries.map((s) => s.points.length);
console.log(`Series length: min ${Math.min(...lengths)}  median ${med(lengths).toFixed(0)}  max ${Math.max(...lengths)}\n`);

// --- 1. Which series construction gives the most predictable price? ---------
console.log('='.repeat(78));
console.log('SERIES CONSTRUCTION  (naive-benchmark MAPE — lower = a less noisy index)');
console.log('='.repeat(78));
const byConstruction = new Map<string, number[]>();
for (const s of allSeries) {
  const sc = evaluate(s.points, CANDIDATES[0], H, 12);
  if (sc) byConstruction.set(s.construction, [...(byConstruction.get(s.construction) ?? []), sc.mape]);
}
const constructionRank = [...byConstruction.entries()]
  .map(([k, v]) => ({ construction: k, medianMape: med(v), series: v.length }))
  .sort((a, b) => a.medianMape - b.medianMape);
for (const c of constructionRank) {
  console.log(`  ${c.construction.padEnd(20)} median naive MAPE ${c.medianMape.toFixed(1).padStart(6)}%   (${c.series} series)`);
}
const bestConstruction = constructionRank[0].construction;
console.log(`\n  -> using "${bestConstruction}" for the model comparison\n`);

// --- 2. Which model wins on that construction? -----------------------------
const target = allSeries.filter((s) => s.construction === bestConstruction);
interface Agg {
  model: Forecaster;
  mases: number[];
  mapes: number[];
  winsVsNaive: number;
  evaluated: number;
}
const results: Agg[] = CANDIDATES.map((model) => ({ model, mases: [], mapes: [], winsVsNaive: 0, evaluated: 0 }));

for (const s of target) {
  const naiveScore = evaluate(s.points, CANDIDATES[0], H, 12);
  if (!naiveScore) continue;
  for (const agg of results) {
    const sc = evaluate(s.points, agg.model, H, 12);
    if (!sc) continue;
    // Skill relative to naive on the SAME folds of the SAME series. Naive
    // therefore scores exactly 1.000 and every other number reads directly as
    // "fraction of the benchmark's error".
    agg.mases.push(sc.mae / naiveScore.mae);
    agg.mapes.push(sc.mape);
    agg.evaluated++;
    if (sc.mae < naiveScore.mae) agg.winsVsNaive++;
  }
}

const ranked = results
  .filter((r) => r.evaluated >= Math.floor(target.length * 0.6))
  .map((r) => ({
    key: r.model.key,
    label: r.model.label,
    meanMase: r.mases.reduce((a, b) => a + b, 0) / r.mases.length,
    medianMase: med(r.mases),
    medianMape: med(r.mapes),
    winRate: r.winsVsNaive / r.evaluated,
    n: r.evaluated,
  }))
  .sort((a, b) => a.meanMase - b.meanMase);

console.log('='.repeat(78));
console.log(`MODEL RANKING   (relative MAE vs naive on identical folds; ${target.length} series, h=${H})`);
console.log('='.repeat(78));
console.log(`  ${'model'.padEnd(42)} ${'relMAE'.padStart(6)} ${'med'.padStart(6)} ${'MAPE'.padStart(7)} ${'beats naive'.padStart(12)}`);
console.log('  ' + '-'.repeat(76));
for (const r of ranked) {
  const flag = r.meanMase < 1 ? ' *' : '  ';
  console.log(
    `${flag}${r.label.slice(0, 42).padEnd(42)} ${r.meanMase.toFixed(3).padStart(6)} ${r.medianMase.toFixed(3).padStart(6)} ${r.medianMape.toFixed(1).padStart(6)}% ${((r.winRate * 100).toFixed(0) + '%').padStart(12)}`,
  );
}

console.log(`\n  * = beats the naive benchmark on mean MASE`);
console.log(`  Best: ${ranked[0].label}  (relMAE ${ranked[0].meanMase.toFixed(3)} = ${((1 - ranked[0].meanMase) * 100).toFixed(1)}% less error than naive, wins on ${(ranked[0].winRate * 100).toFixed(0)}% of series)`);
console.log(`  Production today: ${ranked.find((r) => r.key === 'holt-fixed')?.meanMase.toFixed(3) ?? 'n/a'} (hand-set Holt)\n`);

// --- 3. Which interval method is actually calibrated? ----------------------
//
// Coverage and width are reported together, plus the interval score (a proper
// scoring rule). A method with 100% coverage and a huge width is not "safe" —
// it is uninformative, and the score says so.

const LEVEL = 0.8;
const bestModel = CANDIDATES.find((c) => c.key === ranked[0].key)!;

interface IvAgg {
  key: string;
  label: string;
  hits: number;
  total: number;
  widthRatios: number[];
  scores: number[];
  degenerate: number;
}
const ivResults: IvAgg[] = INTERVAL_METHODS.map((m) => ({ key: m.key, label: m.label, hits: 0, total: 0, widthRatios: [], scores: [], degenerate: 0 }));

for (const s of target) {
  const series = s.points;
  const start = Math.max(12, bestModel.minTrain);
  // Walk forward; at each step build the band from the residuals seen SO FAR
  // (never from future data — that is the whole point of the exercise).
  for (let k = start + 6; k + H <= series.length; k++) {
    const train = series.slice(0, k);
    const residuals: { actual: number; predicted: number }[] = [];
    for (let j = start; j < k; j++) {
      const p = bestModel.fit(series.slice(0, j), H)[H - 1];
      if (Number.isFinite(p) && series[j + H - 1] > 0) residuals.push({ actual: series[j + H - 1], predicted: p });
    }
    if (residuals.length < 5) continue;
    const point = bestModel.fit(train, H)[H - 1];
    const actual = series[k + H - 1];
    if (!Number.isFinite(point) || !(actual > 0)) continue;

    for (const method of INTERVAL_METHODS) {
      const agg = ivResults.find((a) => a.key === method.key)!;
      const band = method.band(point, residuals, LEVEL);
      agg.total++;
      if (actual >= band.lower && actual <= band.upper) agg.hits++;
      agg.widthRatios.push((band.upper - band.lower) / point);
      agg.scores.push(intervalScore(actual, band, LEVEL));
      if (band.lower <= 0.005 * point) agg.degenerate++;
    }
  }
}

console.log('='.repeat(78));
console.log(`INTERVAL CALIBRATION   (nominal ${LEVEL * 100}%, point forecast = ${bestModel.label})`);
console.log('='.repeat(78));
console.log(`  ${'method'.padEnd(38)} ${'coverage'.padStart(9)} ${'width'.padStart(8)} ${'score'.padStart(8)} ${'zero-floor'.padStart(11)}`);
console.log('  ' + '-'.repeat(76));
const ivRanked = ivResults
  .filter((a) => a.total > 0)
  .map((a) => ({
    ...a,
    coverage: a.hits / a.total,
    width: med(a.widthRatios),
    score: a.scores.reduce((x, y) => x + y, 0) / a.scores.length,
    degenRate: a.degenerate / a.total,
  }))
  // Rank by distance from nominal coverage first, then by score.
  .sort((a, b) => Math.abs(a.coverage - LEVEL) - Math.abs(b.coverage - LEVEL) || a.score - b.score);
for (const a of ivRanked) {
  const off = Math.abs(a.coverage - LEVEL) <= 0.05 ? ' *' : '  ';
  console.log(
    `${off}${a.label.slice(0, 38).padEnd(38)} ${((a.coverage * 100).toFixed(1) + '%').padStart(9)} ${((a.width * 100).toFixed(0) + '%').padStart(8)} ${a.score.toFixed(3).padStart(8)} ${((a.degenRate * 100).toFixed(0) + '%').padStart(11)}`,
  );
}
console.log(`
  * = coverage within 5pp of nominal    width = band width as % of the forecast`);
console.log(`  zero-floor = share of bands whose lower bound collapsed to ~0 (uninformative)`);
console.log(`  Best calibrated: ${ivRanked[0].label}
`);
