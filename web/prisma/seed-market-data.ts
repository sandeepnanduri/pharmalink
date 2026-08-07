/**
 * Seeds the price-prediction engine from a captured snapshot of REAL public
 * data (`prisma/fixtures/`), not from invented numbers.
 *
 * Every price in the demo database is an implied unit value that UN Comtrade
 * actually published, every FX rate is an ECB reference rate, and every supply
 * event is an openFDA record. Re-capture with
 * `node scripts/capture-market-data.mjs`.
 *
 * The alternative — generating a plausible-looking price curve — would make the
 * forecast demo itself dishonest, which is the one thing this feature cannot be.
 */
import type { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { forecast, monthStart } from '../src/lib/forecast';
import {
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
} from '../src/lib/market-data';

const FIXTURES = join(__dirname, 'fixtures');

interface ComtradeFixtureRow extends ComtradeRow {
  reporterIso: string;
  reporterName: string;
}

function readFixture<T>(name: string): T | null {
  try {
    return JSON.parse(readFileSync(join(FIXTURES, name), 'utf8')) as T;
  } catch {
    return null; // a missing fixture must not break `db:seed`
  }
}

export async function seedMarketData(prisma: PrismaClient): Promise<Record<string, number>> {
  await prisma.priceForecast.deleteMany();
  await prisma.priceObservation.deleteMany();
  await prisma.supplyEvent.deleteMany();
  await prisma.marketSignal.deleteMany();
  await prisma.ingestRun.deleteMany();

  const counts = { prices: 0, signals: 0, events: 0, rejected: 0 };

  // --- Prices: UN Comtrade implied unit values -----------------------------
  const comtrade = readFixture<{ capturedAt: string; rows: ComtradeFixtureRow[] }>('comtrade.json');
  if (comtrade) {
    const docsUrl = sourceById('comtrade')?.docsUrl ?? null;
    for (const row of comtrade.rows) {
      const mappings = HS_BY_CAS.filter((m) => m.hs6 === row.cmdCode);
      const normalised = comtradeUnitValue(row);
      if ('rejected' in normalised) {
        counts.rejected += mappings.length;
        continue;
      }
      for (const m of mappings) {
        await prisma.priceObservation.create({
          data: {
            cas: m.cas,
            productName: m.name,
            observedAt: normalised.observedAt,
            unitPriceUsdKg: normalised.unitPriceUsdKg,
            rawPrice: normalised.unitPriceUsdKg,
            rawCurrency: 'USD',
            rawUnit: 'kg',
            quantityKg: normalised.quantityKg,
            region: row.reporterIso,
            sourceType: 'customs',
            sourceName: `UN Comtrade — ${row.reporterName} exports, HS ${row.cmdCode}`,
            sourceUrl: docsUrl,
            sourceRef: `${comtradeRef(row)}:${m.cas}`,
            weight: customsWeight(m.specificity),
          },
        });
        counts.prices++;
      }
    }
    await prisma.ingestRun.create({
      data: {
        source: 'comtrade',
        status: 'ok',
        fetched: comtrade.rows.length,
        inserted: counts.prices,
        skipped: counts.rejected,
        startedAt: new Date(comtrade.capturedAt),
        finishedAt: new Date(comtrade.capturedAt),
      },
    });
  }

  // --- Macro drivers: ECB reference rates ----------------------------------
  const fx = readFixture<{ capturedAt: string; months: { period: string; INR: number; CNY: number }[] }>('fx.json');
  if (fx) {
    const docsUrl = sourceById('frankfurter-fx')?.docsUrl ?? null;
    for (const m of fx.months) {
      const periodStart = new Date(`${m.period}-01T00:00:00.000Z`);
      for (const [key, label, unit, value] of [
        ['fx.usdinr', 'USD / INR', 'INR', m.INR],
        ['fx.usdcny', 'USD / CNY', 'CNY', m.CNY],
      ] as const) {
        if (typeof value !== 'number') continue;
        await prisma.marketSignal.create({
          data: { key, label, periodStart, value, unit, sourceName: 'ECB reference rates via Frankfurter', sourceUrl: docsUrl },
        });
        counts.signals++;
      }
    }
    await prisma.ingestRun.create({
      data: {
        source: 'frankfurter-fx',
        status: 'ok',
        fetched: fx.months.length,
        inserted: counts.signals,
        startedAt: new Date(fx.capturedAt),
        finishedAt: new Date(fx.capturedAt),
      },
    });
  }

  // --- Supply events: openFDA shortages + recalls ---------------------------
  const openfda = readFixture<{ capturedAt: string; shortages: ShortageRecord[]; recalls: EnforcementRecord[] }>('openfda.json');
  if (openfda) {
    const seen = new Set<string>();
    const batches = [
      { rows: openfda.shortages.map(normaliseShortage), name: 'openFDA drug shortages', url: sourceById('openfda-shortages')?.docsUrl ?? null },
      { rows: openfda.recalls.map(normaliseEnforcement), name: 'openFDA recall enforcement', url: sourceById('openfda-enforcement')?.docsUrl ?? null },
    ];
    for (const batch of batches) {
      for (const e of batch.rows) {
        if (!e || seen.has(e.sourceRef)) continue;
        const cas = matchMolecule(e.subject);
        // The demo database keeps every event that resolves to a molecule we
        // track, plus a sample of the rest so the market-wide feed is not empty.
        if (!cas && seen.size > 120) continue;
        seen.add(e.sourceRef);
        await prisma.supplyEvent.create({
          data: {
            cas,
            subject: e.subject,
            company: e.company,
            eventType: e.eventType,
            severity: e.severity,
            occurredAt: e.occurredAt,
            detail: e.detail,
            sourceName: batch.name,
            sourceUrl: batch.url,
            sourceRef: e.sourceRef,
          },
        });
        counts.events++;
      }
    }
    await prisma.ingestRun.create({
      data: {
        source: 'openfda-shortages',
        status: 'ok',
        fetched: openfda.shortages.length + openfda.recalls.length,
        inserted: counts.events,
        startedAt: new Date(openfda.capturedAt),
        finishedAt: new Date(openfda.capturedAt),
      },
    });
  }

  return counts;
}

/**
 * Fills the forecast scoreboard with genuine as-of-then predictions.
 *
 * For each of the last few months, the model is re-run using ONLY observations
 * that existed on or before that date, and the result is stored with that date
 * as `issuedAt`. The scoreboard then scores those against what actually
 * happened afterwards.
 *
 * This is a real out-of-sample record, not a flattering one: the seed does not
 * choose which molecules or which months to include, and a model that predicted
 * badly shows up as having predicted badly.
 */
export async function seedForecastScoreboard(prisma: PrismaClient, lookbackMonths = 6): Promise<number> {
  const molecules = await prisma.priceObservation.findMany({ select: { cas: true }, distinct: ['cas'] });
  const latest = await prisma.priceObservation.findFirst({ orderBy: { observedAt: 'desc' }, select: { observedAt: true } });
  if (!latest) return 0;

  let written = 0;
  for (const { cas } of molecules) {
    const all = await prisma.priceObservation.findMany({ where: { cas }, orderBy: { observedAt: 'asc' } });

    for (let back = lookbackMonths; back >= 1; back--) {
      const asOf = new Date(latest.observedAt);
      asOf.setUTCMonth(asOf.getUTCMonth() - back + 1);
      asOf.setUTCDate(1);
      asOf.setUTCHours(0, 0, 0, 0);

      const visible = all.filter((o) => o.observedAt < asOf);
      const f = forecast(
        visible.map((o) => ({ observedAt: o.observedAt, unitPriceUsdKg: o.unitPriceUsdKg, quantityKg: o.quantityKg, weight: o.weight })),
        { horizon: 1 },
      );
      if (f.status !== 'ok' || f.points.length === 0) continue;

      const p = f.points[0];
      await prisma.priceForecast.create({
        data: {
          cas,
          horizonMonth: monthStart(p.period),
          issuedAt: asOf,
          model: f.model ?? 'naive',
          p10: p.p10,
          p50: p.p50,
          p90: p.p90,
          mape: f.accuracy?.mape ?? null,
          observations: f.observations,
          confidence: f.confidence,
        },
      });
      written++;
    }
  }
  return written;
}
