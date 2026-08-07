/**
 * Deep history capture for the model bake-off.
 *
 * The production connector pulls 18–24 months from two reporters, which is
 * enough to forecast but far too little to *choose* a forecasting method — with
 * 24 points a rolling-origin backtest gets ~20 folds, and the difference
 * between two models at that sample size is noise.
 *
 * This pulls the full usable depth instead: ~100 months across the main
 * API-exporting economies. Output feeds `scripts/model-bakeoff.mjs`.
 *
 * Slow by design — UN Comtrade's free endpoint rate-limits below one call per
 * second, and one call covers one period for one reporter (all commodities).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'prisma', 'fixtures');
mkdirSync(OUT, { recursive: true });
const FILE = join(OUT, 'comtrade-history.json');

const HS_CODES = ['292429', '291639', '291822', '293627', '293623', '293626', '293628', '294150', '294140', '294130', '294110', '293359'];

/** The economies that actually manufacture and export APIs at scale. */
const REPORTERS = [
  { code: 699, iso: 'IN', name: 'India' },
  { code: 156, iso: 'CN', name: 'China' },
  { code: 276, iso: 'DE', name: 'Germany' },
  { code: 380, iso: 'IT', name: 'Italy' },
  { code: 842, iso: 'US', name: 'United States' },
  { code: 724, iso: 'ES', name: 'Spain' },
  { code: 392, iso: 'JP', name: 'Japan' },
];

const START = '2018-01';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function periods(startYm) {
  const [sy, sm] = startYm.split('-').map(Number);
  const out = [];
  const cursor = new Date(Date.UTC(sy, sm - 1, 1));
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1));
  while (cursor <= end) {
    out.push(`${cursor.getUTCFullYear()}${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return out;
}

async function getJson(url, attempt = 0) {
  const res = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'PharmaLink-MarketData/1.0' } });
  if (res.ok) return res.json();
  if ((res.status === 429 || res.status >= 500) && attempt < 6) {
    await sleep(Math.round(2500 * Math.pow(2, attempt) * (0.85 + Math.random() * 0.3)));
    return getJson(url, attempt + 1);
  }
  throw new Error(`${res.status}`);
}

// Resume support: a 25-minute pull must survive an interruption.
const done = new Set();
let rows = [];
if (existsSync(FILE)) {
  const prev = JSON.parse(readFileSync(FILE, 'utf8'));
  rows = prev.rows ?? [];
  for (const k of prev.completed ?? []) done.add(k);
  console.log(`resuming: ${rows.length} rows, ${done.size} cells already fetched`);
}

const all = periods(START);
console.log(`${REPORTERS.length} reporters x ${all.length} months = ${REPORTERS.length * all.length} calls`);

let n = 0;
for (const rep of REPORTERS) {
  for (const period of all) {
    const key = `${rep.code}:${period}`;
    n++;
    if (done.has(key)) continue;
    try {
      const params = new URLSearchParams({
        reporterCode: String(rep.code),
        period,
        cmdCode: HS_CODES.join(','),
        flowCode: 'X',
        partnerCode: '0',
        partner2Code: '0',
        customsCode: 'C00',
        motCode: '0',
      });
      const body = await getJson(`https://comtradeapi.un.org/public/v1/preview/C/M/HS?${params}`);
      if (!body.error) {
        for (const d of body.data ?? []) {
          rows.push({
            period: d.period,
            reporterIso: rep.iso,
            reporterName: rep.name,
            reporterCode: d.reporterCode,
            flowCode: d.flowCode,
            cmdCode: d.cmdCode,
            netWgt: d.netWgt,
            qty: d.qty,
            qtyUnitCode: d.qtyUnitCode,
            primaryValue: d.primaryValue,
          });
        }
        done.add(key);
      }
    } catch (e) {
      console.warn(`  ${rep.iso} ${period}: ${e.message}`);
    }
    if (n % 25 === 0) {
      writeFileSync(FILE, JSON.stringify({ capturedAt: new Date().toISOString(), completed: [...done], rows }, null, 0) + '\n');
      console.log(`  ${n}/${REPORTERS.length * all.length}  rows=${rows.length}`);
    }
    await sleep(1300);
  }
}

writeFileSync(FILE, JSON.stringify({ capturedAt: new Date().toISOString(), completed: [...done], rows }, null, 0) + '\n');
console.log(`\ndone: ${rows.length} rows -> ${FILE}`);
