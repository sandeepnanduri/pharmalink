import 'server-only';
import { prisma } from '@/lib/db';
import { assertSafeUrl } from '@/lib/net-guard.server';
import { mirrorInternalPrices } from '@/lib/market-data-internal';
import {
  ALLOWED_HOSTS,
  HS_BY_CAS,
  comtradeRef,
  comtradeUnitValue,
  customsWeight,
  matchMolecule,
  normaliseEnforcement,
  normaliseShortage,
  sourceById,
  type ComtradeRow,
  type EnforcementRecord,
  type ShortageRecord,
} from '@/lib/market-data';

/**
 * External-data connectors — the server half.
 *
 * Every fetch in here goes to a host that appears in `ALLOWED_HOSTS`, which is
 * derived from the source registry. Even though these URLs are built by us and
 * not by a user, they still go through the same SSRF guard as the content
 * crawler: a connector is exactly the kind of code that grows a
 * "configurable endpoint" later.
 *
 * Every run is recorded in `IngestRun` — including failures. Silent ingestion
 * is how a dashboard ends up quietly showing four-month-old numbers.
 */

const FETCH_TIMEOUT_MS = 20_000;
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
/**
 * Politeness gap between calls to the same upstream.
 *
 * Measured, not guessed: UN Comtrade's free endpoint 429s on most calls at a
 * 400ms gap. 1.4s with backoff completes a full history pull cleanly.
 */
const THROTTLE_MS = 1_400;
const MAX_RETRIES = 4;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * GET JSON from an allowlisted host, with SSRF, timeout, size and retry guards.
 * 429 and 5xx are retried with exponential backoff; everything else fails fast,
 * because retrying a 404 just wastes someone else's quota.
 */
async function fetchJson<T>(rawUrl: string, attempt = 0): Promise<T> {
  const url = await assertSafeUrl(rawUrl, { schemes: ['https:'], defaultPortOnly: true });
  if (!url) throw new Error(`refused unsafe url: ${rawUrl}`);
  if (!ALLOWED_HOSTS.includes(url.hostname)) throw new Error(`host not in the connector allowlist: ${url.hostname}`);

  const res = await fetch(url, {
    redirect: 'error', // a 3xx to an internal host must not slip past the guard
    headers: { accept: 'application/json', 'user-agent': 'PharmaLink-MarketData/1.0' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    cache: 'no-store',
  });

  if (!res.ok) {
    const retryable = res.status === 429 || res.status >= 500;
    if (retryable && attempt < MAX_RETRIES) {
      await sleep(2_000 * Math.pow(2, attempt));
      return fetchJson<T>(rawUrl, attempt + 1);
    }
    throw new Error(`${url.hostname} returned ${res.status}`);
  }

  const length = Number(res.headers.get('content-length') ?? 0);
  if (length > MAX_RESPONSE_BYTES) throw new Error(`response too large (${length} bytes)`);
  const text = await res.text();
  if (text.length > MAX_RESPONSE_BYTES) throw new Error('response too large');
  return JSON.parse(text) as T;
}

// ---------------------------------------------------------------------------
// Run bookkeeping
// ---------------------------------------------------------------------------

export interface IngestSummary {
  source: string;
  status: 'ok' | 'failed';
  fetched: number;
  inserted: number;
  skipped: number;
  error?: string;
}

async function withRun(source: string, work: () => Promise<{ fetched: number; inserted: number; skipped: number }>): Promise<IngestSummary> {
  const run = await prisma.ingestRun.create({ data: { source } });
  try {
    const counts = await work();
    await prisma.ingestRun.update({ where: { id: run.id }, data: { ...counts, status: 'ok', finishedAt: new Date() } });
    return { source, status: 'ok', ...counts };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await prisma.ingestRun.update({ where: { id: run.id }, data: { status: 'failed', error: error.slice(0, 500), finishedAt: new Date() } });
    return { source, status: 'failed', fetched: 0, inserted: 0, skipped: 0, error };
  }
}

// ---------------------------------------------------------------------------
// UN Comtrade — implied unit values
// ---------------------------------------------------------------------------

/**
 * Reporters worth pulling. Export flows, because an exporter's unit value is
 * the supply-side price; import unit values carry the destination's freight and
 * duty and describe a different thing.
 */
export const COMTRADE_REPORTERS = [
  { code: 699, iso: 'IN', name: 'India' },
  { code: 156, iso: 'CN', name: 'China' },
] as const;

/** The free preview endpoint accepts ONE period per call but many commodities. */
function comtradeUrl(reporterCode: number, period: string, cmdCodes: string[], flow: 'M' | 'X'): string {
  const params = new URLSearchParams({
    reporterCode: String(reporterCode),
    period,
    cmdCode: cmdCodes.join(','),
    flowCode: flow,
    partnerCode: '0', // world
    partner2Code: '0',
    customsCode: 'C00',
    motCode: '0',
  });
  return `https://comtradeapi.un.org/public/v1/preview/C/M/HS?${params}`;
}

/** "YYYYMM" keys for the `months` complete months ending before `asOf`. */
export function recentPeriods(months: number, asOf = new Date()): string[] {
  const out: string[] = [];
  // Trade statistics lag ~2 months, so the current and previous month are
  // usually empty. Starting further back avoids burning calls on nothing.
  const cursor = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() - 2, 1));
  for (let i = 0; i < months; i++) {
    out.push(`${cursor.getUTCFullYear()}${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`);
    cursor.setUTCMonth(cursor.getUTCMonth() - 1);
  }
  return out;
}

export async function ingestComtrade(opts: { months?: number; flow?: 'M' | 'X' } = {}): Promise<IngestSummary> {
  const months = Math.max(1, Math.min(36, opts.months ?? 18));
  const flow = opts.flow ?? 'X';
  const cmdCodes = [...new Set(HS_BY_CAS.map((m) => m.hs6))];

  return withRun('comtrade', async () => {
    let fetched = 0;
    let inserted = 0;
    let skipped = 0;

    for (const reporter of COMTRADE_REPORTERS) {
      for (const period of recentPeriods(months)) {
        const body = await fetchJson<{ data?: ComtradeRow[]; error?: string }>(comtradeUrl(reporter.code, period, cmdCodes, flow));
        if (body.error) throw new Error(`comtrade: ${body.error}`);
        const rows = body.data ?? [];
        fetched += rows.length;

        for (const row of rows) {
          // One HS heading can map to several molecules we track; each gets its
          // own observation, all flagged with the same specificity caveat.
          const mappings = HS_BY_CAS.filter((m) => m.hs6 === row.cmdCode);
          if (mappings.length === 0) {
            skipped++;
            continue;
          }
          const normalised = comtradeUnitValue(row);
          if ('rejected' in normalised) {
            skipped += mappings.length;
            continue;
          }
          for (const m of mappings) {
            const ref = `${comtradeRef(row)}:${m.cas}`;
            const data = {
              cas: m.cas,
              productName: m.name,
              observedAt: normalised.observedAt,
              unitPriceUsdKg: normalised.unitPriceUsdKg,
              rawPrice: normalised.unitPriceUsdKg,
              rawCurrency: 'USD',
              rawUnit: 'kg',
              quantityKg: normalised.quantityKg,
              region: reporter.iso,
              sourceType: 'customs',
              sourceName: `UN Comtrade — ${reporter.name} ${flow === 'X' ? 'exports' : 'imports'}, HS ${row.cmdCode}`,
              sourceUrl: sourceById('comtrade')?.docsUrl ?? null,
              sourceRef: ref,
              weight: customsWeight(m.specificity),
            };
            await prisma.priceObservation.upsert({ where: { sourceRef: ref }, create: data, update: data });
            inserted++;
          }
        }
        await sleep(THROTTLE_MS);
      }
    }
    return { fetched, inserted, skipped };
  });
}

// ---------------------------------------------------------------------------
// openFDA — supply events
// ---------------------------------------------------------------------------

interface OpenFdaResponse<T> {
  results?: T[];
  error?: { code: string; message: string };
}

/** Stores a normalised event, resolving its molecule where the name allows. */
async function saveEvents(
  events: ReturnType<typeof normaliseShortage>[],
  sourceName: string,
  sourceUrl: string | null,
): Promise<{ inserted: number; skipped: number }> {
  let inserted = 0;
  let skipped = 0;
  for (const e of events) {
    if (!e) {
      skipped++;
      continue;
    }
    const data = {
      cas: matchMolecule(e.subject),
      subject: e.subject,
      company: e.company,
      eventType: e.eventType,
      severity: e.severity,
      occurredAt: e.occurredAt,
      detail: e.detail,
      sourceName,
      sourceUrl,
      sourceRef: e.sourceRef,
    };
    await prisma.supplyEvent.upsert({ where: { sourceRef: e.sourceRef }, create: data, update: data });
    inserted++;
  }
  return { inserted, skipped };
}

export async function ingestShortages(limit = 500): Promise<IngestSummary> {
  return withRun('openfda-shortages', async () => {
    const body = await fetchJson<OpenFdaResponse<ShortageRecord>>(
      `https://api.fda.gov/drug/shortages.json?limit=${Math.min(1000, limit)}&sort=update_date:desc`,
    );
    if (body.error) throw new Error(`openFDA: ${body.error.message}`);
    const rows = body.results ?? [];
    const counts = await saveEvents(rows.map(normaliseShortage), 'openFDA drug shortages', sourceById('openfda-shortages')?.docsUrl ?? null);
    return { fetched: rows.length, ...counts };
  });
}

export async function ingestRecalls(limit = 300): Promise<IngestSummary> {
  return withRun('openfda-enforcement', async () => {
    const body = await fetchJson<OpenFdaResponse<EnforcementRecord>>(
      `https://api.fda.gov/drug/enforcement.json?limit=${Math.min(1000, limit)}&sort=recall_initiation_date:desc`,
    );
    if (body.error) throw new Error(`openFDA: ${body.error.message}`);
    const rows = body.results ?? [];
    const counts = await saveEvents(rows.map(normaliseEnforcement), 'openFDA recall enforcement', sourceById('openfda-enforcement')?.docsUrl ?? null);
    return { fetched: rows.length, ...counts };
  });
}

// ---------------------------------------------------------------------------
// FX — the currency leg of every India/China-sourced price
// ---------------------------------------------------------------------------

const FX_PAIRS = [
  { key: 'fx.usdinr', symbol: 'INR', label: 'USD / INR' },
  { key: 'fx.usdcny', symbol: 'CNY', label: 'USD / CNY' },
] as const;

export async function ingestFx(months = 24): Promise<IngestSummary> {
  return withRun('frankfurter-fx', async () => {
    const start = new Date();
    start.setUTCMonth(start.getUTCMonth() - months);
    const from = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}-01`;
    const symbols = FX_PAIRS.map((p) => p.symbol).join(',');

    const body = await fetchJson<{ rates?: Record<string, Record<string, number>> }>(
      `https://api.frankfurter.dev/v1/${from}..?base=USD&symbols=${symbols}`,
    );
    const rates = body.rates ?? {};

    // Daily rates → one monthly value each. The month's LAST published rate is
    // used rather than an average: a price quoted in a month settles against a
    // rate near its end, and an average of an unequal number of business days
    // is not a rate anyone transacted at.
    const monthly = new Map<string, Map<string, { day: string; value: number }>>();
    let fetched = 0;
    for (const [day, byCurrency] of Object.entries(rates)) {
      const period = day.slice(0, 7);
      for (const pair of FX_PAIRS) {
        const value = byCurrency[pair.symbol];
        if (typeof value !== 'number') continue;
        fetched++;
        const forKey = monthly.get(pair.key) ?? new Map();
        const existing = forKey.get(period);
        if (!existing || existing.day < day) forKey.set(period, { day, value });
        monthly.set(pair.key, forKey);
      }
    }

    let inserted = 0;
    for (const pair of FX_PAIRS) {
      for (const [period, { value }] of monthly.get(pair.key) ?? []) {
        const periodStart = new Date(`${period}-01T00:00:00.000Z`);
        const data = {
          key: pair.key,
          label: pair.label,
          periodStart,
          value,
          unit: pair.symbol,
          sourceName: 'ECB reference rates via Frankfurter',
          sourceUrl: sourceById('frankfurter-fx')?.docsUrl ?? null,
        };
        await prisma.marketSignal.upsert({ where: { key_periodStart: { key: pair.key, periodStart } }, create: data, update: data });
        inserted++;
      }
    }
    return { fetched, inserted, skipped: 0 };
  });
}

// ---------------------------------------------------------------------------
// Internal activity — our own quotes and deals as price observations
// ---------------------------------------------------------------------------

/**
 * Mirrors platform quotes and closed deals into the observation table so the
 * forecast sees one unified history. This is the highest-quality evidence we
 * have: a deal is a price that was actually agreed. The mapping itself lives in
 * `market-data-internal.ts` so the Prisma seed can reuse it verbatim.
 */
export async function ingestInternal(): Promise<IngestSummary> {
  return withRun('internal', async () => mirrorInternalPrices(prisma));
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

export const INGESTIBLE = ['internal', 'comtrade', 'openfda-shortages', 'openfda-enforcement', 'frankfurter-fx'] as const;
export type IngestibleSource = (typeof INGESTIBLE)[number];

export function isIngestible(value: string): value is IngestibleSource {
  return (INGESTIBLE as readonly string[]).includes(value);
}

export async function runIngest(source: IngestibleSource): Promise<IngestSummary> {
  switch (source) {
    case 'internal':
      return ingestInternal();
    case 'comtrade':
      return ingestComtrade();
    case 'openfda-shortages':
      return ingestShortages();
    case 'openfda-enforcement':
      return ingestRecalls();
    case 'frankfurter-fx':
      return ingestFx();
  }
}

/** Latest run per source, for the admin console's freshness panel. */
export async function latestRuns() {
  const runs = await prisma.ingestRun.findMany({ orderBy: { startedAt: 'desc' }, take: 100 });
  const bySource = new Map<string, (typeof runs)[number]>();
  for (const r of runs) if (!bySource.has(r.source)) bySource.set(r.source, r);
  return bySource;
}
