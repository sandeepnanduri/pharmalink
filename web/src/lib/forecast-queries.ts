import { prisma } from '@/lib/db';
import { forecast, monthKey, type ForecastResult, type RawObservation } from '@/lib/forecast';
import { analyseDrivers, type DriverInsight, type DriverSeries } from '@/lib/drivers';
import { supplyRisk, type RiskEvent, type SupplyRisk } from '@/lib/supply-risk';
import { hsForCas } from '@/lib/market-data';

/**
 * Assembles the prediction engine's inputs from the database.
 *
 * The rule throughout: if the data is not there, the answer is "not enough
 * data", never a filled-in default. Every panel this feeds can render an
 * honest empty state.
 */

/** Where a molecule's price history actually came from — shown to the user. */
export interface Provenance {
  sourceType: string;
  sourceName: string;
  sourceUrl: string | null;
  observations: number;
  firstSeen: Date;
  lastSeen: Date;
}

export interface MoleculeIntelligence {
  cas: string;
  productName: string;
  forecast: ForecastResult;
  drivers: DriverInsight[];
  risk: SupplyRisk;
  provenance: Provenance[];
  events: { subject: string; company: string | null; eventType: string; severity: string; occurredAt: Date; sourceUrl: string | null }[];
  suppliers: { name: string; share: number }[];
  /** The HS heading customs data was read from, and how specific it is. */
  hs: { code: string; description: string; specificity: string } | null;
}

/** Monthly driver series (FX etc.) shaped for the correlation module. */
async function loadDrivers(): Promise<DriverSeries[]> {
  const signals = await prisma.marketSignal.findMany({ orderBy: { periodStart: 'asc' } });
  const byKey = new Map<string, DriverSeries>();
  for (const s of signals) {
    const series = byKey.get(s.key) ?? { key: s.key, label: s.label, unit: s.unit, points: [] };
    series.points.push({ period: monthKey(s.periodStart), value: s.value });
    byKey.set(s.key, series);
  }
  return [...byKey.values()];
}

/**
 * Who can actually supply this molecule, with a volume proxy.
 *
 * Share is quote count, not tonnage — we do not know anyone's production
 * volume, and pretending otherwise would make the concentration index fiction.
 * A supplier who has never quoted still counts as one unit of capacity.
 */
async function loadSuppliers(cas: string): Promise<{ name: string; share: number }[]> {
  const [products, quotes] = await Promise.all([
    prisma.product.findMany({ where: { cas, status: 'live' }, select: { org: { select: { id: true, name: true } } } }),
    prisma.quote.findMany({ where: { rfq: { cas } }, select: { sellerOrgId: true } }),
  ]);
  const quoteCount = new Map<string, number>();
  for (const q of quotes) quoteCount.set(q.sellerOrgId, (quoteCount.get(q.sellerOrgId) ?? 0) + 1);

  const byOrg = new Map<string, { name: string; share: number }>();
  for (const p of products) {
    if (byOrg.has(p.org.id)) continue;
    byOrg.set(p.org.id, { name: p.org.name, share: 1 + (quoteCount.get(p.org.id) ?? 0) });
  }
  return [...byOrg.values()].sort((a, b) => b.share - a.share);
}

function toProvenance(rows: { sourceType: string; sourceName: string; sourceUrl: string | null; observedAt: Date }[]): Provenance[] {
  const byName = new Map<string, Provenance>();
  for (const r of rows) {
    const existing = byName.get(r.sourceName);
    if (!existing) {
      byName.set(r.sourceName, {
        sourceType: r.sourceType,
        sourceName: r.sourceName,
        sourceUrl: r.sourceUrl,
        observations: 1,
        firstSeen: r.observedAt,
        lastSeen: r.observedAt,
      });
      continue;
    }
    existing.observations++;
    if (r.observedAt < existing.firstSeen) existing.firstSeen = r.observedAt;
    if (r.observedAt > existing.lastSeen) existing.lastSeen = r.observedAt;
  }
  return [...byName.values()].sort((a, b) => b.observations - a.observations);
}

/** Full intelligence pack for one molecule. */
export async function getMoleculeIntelligence(cas: string, horizon = 3): Promise<MoleculeIntelligence | null> {
  const [observations, events, drivers, suppliers] = await Promise.all([
    prisma.priceObservation.findMany({ where: { cas }, orderBy: { observedAt: 'asc' } }),
    prisma.supplyEvent.findMany({ where: { cas }, orderBy: { occurredAt: 'desc' }, take: 25 }),
    loadDrivers(),
    loadSuppliers(cas),
  ]);
  if (observations.length === 0) return null;

  const raw: RawObservation[] = observations.map((o) => ({
    observedAt: o.observedAt,
    unitPriceUsdKg: o.unitPriceUsdKg,
    quantityKg: o.quantityKg,
    weight: o.weight,
  }));
  const result = forecast(raw, { horizon });

  const riskEvents: RiskEvent[] = events.map((e) => ({
    eventType: e.eventType as RiskEvent['eventType'],
    severity: e.severity as RiskEvent['severity'],
    occurredAt: e.occurredAt,
  }));

  const hs = hsForCas(cas);

  return {
    cas,
    productName: observations.at(-1)?.productName ?? cas,
    forecast: result,
    // Correlating against a history too short to forecast would be worse than
    // useless — it would look like an explanation.
    drivers: result.status === 'ok' ? analyseDrivers(result.history, drivers) : [],
    risk: supplyRisk({ suppliers, events: riskEvents, volatilityPct: result.volatilityPct, asOf: new Date() }),
    provenance: toProvenance(observations),
    events: events.map((e) => ({
      subject: e.subject,
      company: e.company,
      eventType: e.eventType,
      severity: e.severity,
      occurredAt: e.occurredAt,
      sourceUrl: e.sourceUrl,
    })),
    suppliers,
    hs: hs ? { code: hs.hs6, description: hs.hsDescription, specificity: hs.specificity } : null,
  };
}

export interface ForecastRow {
  cas: string;
  productName: string;
  latest: number | null;
  latestPeriod: string | null;
  next: { period: string; p10: number; p50: number; p90: number } | null;
  changePct: number | null;
  confidence: ForecastResult['confidence'];
  model: ForecastResult['model'];
  mape: number | null;
  months: number;
  observations: number;
  riskScore: number;
  riskBand: SupplyRisk['band'];
}

/**
 * One row per molecule with any price history, ordered by how much we know.
 * Molecules with too little data are still listed — with `confidence:
 * 'insufficient'` — because a buyer needs to know the gap exists.
 *
 * Deliberately NOT built by looping `getMoleculeIntelligence`: that would
 * re-read the whole driver series and re-run every correlation once per
 * molecule to produce columns this table does not show. Four queries total,
 * grouped in memory.
 */
export async function getForecastOverview(limit = 12, horizon = 3): Promise<ForecastRow[]> {
  const [observations, events, products, quotes] = await Promise.all([
    prisma.priceObservation.findMany({
      orderBy: { observedAt: 'asc' },
      select: { cas: true, productName: true, observedAt: true, unitPriceUsdKg: true, quantityKg: true, weight: true },
    }),
    prisma.supplyEvent.findMany({ where: { cas: { not: null } }, select: { cas: true, eventType: true, severity: true, occurredAt: true } }),
    prisma.product.findMany({ where: { status: 'live' }, select: { cas: true, orgId: true, org: { select: { name: true } } } }),
    prisma.quote.findMany({ select: { sellerOrgId: true, rfq: { select: { cas: true } } } }),
  ]);

  const byCas = new Map<string, typeof observations>();
  for (const o of observations) {
    const arr = byCas.get(o.cas) ?? [];
    arr.push(o);
    byCas.set(o.cas, arr);
  }

  const eventsByCas = new Map<string, RiskEvent[]>();
  for (const e of events) {
    if (!e.cas) continue;
    const arr = eventsByCas.get(e.cas) ?? [];
    arr.push({ eventType: e.eventType as RiskEvent['eventType'], severity: e.severity as RiskEvent['severity'], occurredAt: e.occurredAt });
    eventsByCas.set(e.cas, arr);
  }

  const quoteCount = new Map<string, number>();
  for (const q of quotes) quoteCount.set(`${q.rfq.cas}|${q.sellerOrgId}`, (quoteCount.get(`${q.rfq.cas}|${q.sellerOrgId}`) ?? 0) + 1);

  const suppliersByCas = new Map<string, { name: string; share: number }[]>();
  for (const p of products) {
    const arr = suppliersByCas.get(p.cas) ?? [];
    if (arr.some((s) => s.name === p.org.name)) continue;
    arr.push({ name: p.org.name, share: 1 + (quoteCount.get(`${p.cas}|${p.orgId}`) ?? 0) });
    suppliersByCas.set(p.cas, arr);
  }

  const asOf = new Date();
  const rows: ForecastRow[] = [];

  for (const [cas, obs] of byCas) {
    const f = forecast(
      obs.map((o) => ({ observedAt: o.observedAt, unitPriceUsdKg: o.unitPriceUsdKg, quantityKg: o.quantityKg, weight: o.weight })),
      { horizon },
    );
    const risk = supplyRisk({
      suppliers: suppliersByCas.get(cas) ?? [],
      events: eventsByCas.get(cas) ?? [],
      volatilityPct: f.volatilityPct,
      asOf,
    });
    const last = f.history.at(-1) ?? null;
    const next = f.points[0] ?? null;
    rows.push({
      cas,
      productName: obs.at(-1)?.productName ?? cas,
      latest: last?.value ?? null,
      latestPeriod: last?.period ?? null,
      next,
      changePct: next && last && last.value > 0 ? Math.round(((next.p50 - last.value) / last.value) * 1000) / 10 : null,
      confidence: f.confidence,
      model: f.model,
      mape: f.accuracy?.mape ?? null,
      months: f.history.length,
      observations: f.observations,
      riskScore: risk.score,
      riskBand: risk.band,
    });
  }

  const order = { high: 0, medium: 1, low: 2, insufficient: 3 } as const;
  return rows.sort((a, b) => order[a.confidence] - order[b.confidence] || b.observations - a.observations).slice(0, limit);
}

/**
 * Records today's forecast so it can be scored later. Idempotent per
 * (molecule, horizon month, day) — re-running the job does not stack rows.
 */
export async function recordForecast(cas: string, horizon = 3): Promise<number> {
  const intel = await getMoleculeIntelligence(cas, horizon);
  if (!intel || intel.forecast.status !== 'ok') return 0;

  const issuedAt = new Date();
  issuedAt.setUTCHours(0, 0, 0, 0);
  let written = 0;

  for (const p of intel.forecast.points) {
    const horizonMonth = new Date(`${p.period}-01T00:00:00.000Z`);
    const key = { cas, horizonMonth, issuedAt };
    const data = {
      ...key,
      model: intel.forecast.model ?? 'naive',
      p10: p.p10,
      p50: p.p50,
      p90: p.p90,
      mape: intel.forecast.accuracy?.mape ?? null,
      observations: intel.forecast.observations,
      confidence: intel.forecast.confidence,
    };
    await prisma.priceForecast.upsert({ where: { cas_horizonMonth_issuedAt: key }, create: data, update: data });
    written++;
  }
  return written;
}

export interface ScoredForecast {
  cas: string;
  productName: string;
  horizonMonth: Date;
  issuedAt: Date;
  p50: number;
  /** Shown alongside `withinBand` — see the note on that field. */
  p10: number;
  p90: number;
  actual: number;
  errorPct: number;
  /**
   * Whether reality landed inside the predicted band.
   *
   * Deliberately reported WITH the band itself. A model too uncertain to give a
   * positive lower bound produces a p10 of 0, and "in range" against a $0 floor
   * is not a success — showing the width lets the reader see that for
   * themselves instead of trusting a green tick.
   */
  withinBand: boolean;
}

/**
 * Past forecasts scored against what the market actually did. This is the
 * scoreboard that makes the whole feature falsifiable — if it is empty or ugly,
 * that is the honest state of it.
 */
export async function getForecastScoreboard(limit = 20): Promise<ScoredForecast[]> {
  const issued = await prisma.priceForecast.findMany({ orderBy: { horizonMonth: 'desc' }, take: 200 });
  if (issued.length === 0) return [];

  const casList = [...new Set(issued.map((f) => f.cas))];
  const observations = await prisma.priceObservation.findMany({ where: { cas: { in: casList } }, orderBy: { observedAt: 'asc' } });

  const actualByCasMonth = new Map<string, { value: number; weight: number }[]>();
  for (const o of observations) {
    const key = `${o.cas}|${monthKey(o.observedAt)}`;
    const arr = actualByCasMonth.get(key) ?? [];
    arr.push({ value: o.unitPriceUsdKg, weight: o.weight });
    actualByCasMonth.set(key, arr);
  }

  const nameByCas = new Map(observations.map((o) => [o.cas, o.productName]));
  const out: ScoredForecast[] = [];

  for (const f of issued) {
    const bucket = actualByCasMonth.get(`${f.cas}|${monthKey(f.horizonMonth)}`);
    if (!bucket || bucket.length === 0) continue; // that month has not happened (or not been reported) yet
    const actual = median(bucket.map((b) => b.value));
    if (!(actual > 0)) continue;
    out.push({
      cas: f.cas,
      productName: nameByCas.get(f.cas) ?? f.cas,
      horizonMonth: f.horizonMonth,
      issuedAt: f.issuedAt,
      p50: f.p50,
      p10: f.p10,
      p90: f.p90,
      actual: Math.round(actual * 100) / 100,
      errorPct: Math.round(((f.p50 - actual) / actual) * 1000) / 10,
      withinBand: actual >= f.p10 && actual <= f.p90,
    });
  }
  return out.slice(0, limit);
}

function median(values: number[]): number {
  const v = [...values].sort((a, b) => a - b);
  if (v.length === 0) return 0;
  const mid = v.length >> 1;
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}
