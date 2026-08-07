/**
 * Captures a snapshot of the public market-data sources into
 * `prisma/fixtures/`, which the seed then loads.
 *
 * Why a fixture rather than calling the APIs from the seed: `npm run db:reset`
 * and every Playwright run would otherwise depend on three third-party hosts
 * being up, and would hammer free endpoints on every CI run. The snapshot keeps
 * the demo database full of REAL published numbers while staying offline and
 * deterministic.
 *
 * Re-capture with:  node scripts/capture-market-data.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'prisma', 'fixtures');
mkdirSync(OUT, { recursive: true });

const HS_CODES = ['292429', '291639', '291822', '293627', '293623', '293626', '293628', '294150', '294140', '294130', '294110', '293359'];
const REPORTERS = [
  { code: 699, iso: 'IN', name: 'India' },
  { code: 156, iso: 'CN', name: 'China' },
];
const MONTHS = 26;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const iso = (d) => d.toISOString().slice(0, 10);

function periods(count) {
  const out = [];
  const now = new Date();
  const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1));
  for (let i = 0; i < count; i++) {
    out.push(`${cursor.getUTCFullYear()}${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`);
    cursor.setUTCMonth(cursor.getUTCMonth() - 1);
  }
  return out.reverse();
}

/**
 * GET with exponential backoff. UN Comtrade's free endpoint rate-limits well
 * below one call per second — at a 400ms gap it returns 429 for most of a run.
 * Frankfurter intermittently 520s on long ranges. Both need patience, not
 * parallelism.
 */
async function getJson(url, attempt = 0) {
  const res = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'PharmaLink-MarketData/1.0' } });
  if (res.ok) return res.json();
  const retryable = res.status === 429 || res.status >= 500;
  if (retryable && attempt < 5) {
    const wait = Math.round(2000 * Math.pow(2, attempt) * (0.8 + Math.random() * 0.4));
    process.stdout.write(`    ${res.status} — backing off ${(wait / 1000).toFixed(1)}s\n`);
    await sleep(wait);
    return getJson(url, attempt + 1);
  }
  throw new Error(`${res.status} ${url}`);
}

async function captureComtrade() {
  const rows = [];
  for (const reporter of REPORTERS) {
    for (const period of periods(MONTHS)) {
      const params = new URLSearchParams({
        reporterCode: String(reporter.code),
        period,
        cmdCode: HS_CODES.join(','),
        flowCode: 'X',
        partnerCode: '0',
        partner2Code: '0',
        customsCode: 'C00',
        motCode: '0',
      });
      try {
        const body = await getJson(`https://comtradeapi.un.org/public/v1/preview/C/M/HS?${params}`);
        if (body.error) {
          console.warn(`  ${reporter.iso} ${period}: ${body.error}`);
        } else {
          for (const d of body.data ?? []) {
            rows.push({
              period: d.period,
              reporterCode: d.reporterCode,
              reporterIso: reporter.iso,
              reporterName: reporter.name,
              flowCode: d.flowCode,
              cmdCode: d.cmdCode,
              netWgt: d.netWgt,
              qty: d.qty,
              qtyUnitCode: d.qtyUnitCode,
              primaryValue: d.primaryValue,
            });
          }
          process.stdout.write(`  ${reporter.iso} ${period}: ${(body.data ?? []).length}\n`);
        }
      } catch (e) {
        console.warn(`  ${reporter.iso} ${period}: ${e.message}`);
      }
      await sleep(1400);
    }
  }
  return rows;
}

async function captureFx() {
  const start = new Date();
  start.setUTCMonth(start.getUTCMonth() - MONTHS - 2);
  const end = new Date();

  // Requested in 12-month windows: the API 520s intermittently on multi-year
  // ranges, and one bad window should not cost the whole capture.
  const windows = [];
  const cursor = new Date(start);
  while (cursor < end) {
    const stop = new Date(cursor);
    stop.setUTCMonth(stop.getUTCMonth() + 12);
    windows.push([iso(cursor), iso(stop < end ? stop : end)]);
    cursor.setUTCMonth(cursor.getUTCMonth() + 12);
  }

  const rates = {};
  for (const [a, b] of windows) {
    const body = await getJson(`https://api.frankfurter.dev/v1/${a}..${b}?base=USD&symbols=INR,CNY`);
    Object.assign(rates, body.rates ?? {});
    await sleep(500);
  }

  // Daily → one row per month, using the month's last published rate.
  const monthly = new Map();
  for (const [day, r] of Object.entries(rates)) {
    const period = day.slice(0, 7);
    const prev = monthly.get(period);
    if (!prev || prev.day < day) monthly.set(period, { day, INR: r.INR, CNY: r.CNY });
  }
  return [...monthly.entries()].map(([period, v]) => ({ period, day: v.day, INR: v.INR, CNY: v.CNY })).sort((a, b) => a.period.localeCompare(b.period));
}

async function captureOpenFda() {
  const shortages = await getJson('https://api.fda.gov/drug/shortages.json?limit=1000&sort=update_date:desc');
  const recalls = await getJson('https://api.fda.gov/drug/enforcement.json?limit=400&sort=recall_initiation_date:desc');
  const pick = (r) => ({
    generic_name: r.generic_name,
    company_name: r.company_name,
    status: r.status,
    update_date: r.update_date,
    initial_posting_date: r.initial_posting_date,
    related_info: r.related_info,
    package_ndc: r.package_ndc,
  });
  const pickRecall = (r) => ({
    recall_number: r.recall_number,
    classification: r.classification,
    recalling_firm: r.recalling_firm,
    product_description: r.product_description,
    reason_for_recall: r.reason_for_recall,
    recall_initiation_date: r.recall_initiation_date,
    status: r.status,
  });
  return { shortages: (shortages.results ?? []).map(pick), recalls: (recalls.results ?? []).map(pickRecall) };
}

console.log('UN Comtrade…');
const comtrade = await captureComtrade();
console.log(`  ${comtrade.length} rows`);

console.log('FX (ECB via Frankfurter)…');
const fx = await captureFx();
console.log(`  ${fx.length} months`);

console.log('openFDA…');
const openfda = await captureOpenFda();
console.log(`  ${openfda.shortages.length} shortages, ${openfda.recalls.length} recalls`);

const capturedAt = new Date().toISOString();
writeFileSync(join(OUT, 'comtrade.json'), JSON.stringify({ capturedAt, rows: comtrade }, null, 1) + '\n');
writeFileSync(join(OUT, 'fx.json'), JSON.stringify({ capturedAt, months: fx }, null, 1) + '\n');
writeFileSync(join(OUT, 'openfda.json'), JSON.stringify({ capturedAt, ...openfda }, null, 1) + '\n');
console.log(`\nWrote fixtures to ${OUT}`);
