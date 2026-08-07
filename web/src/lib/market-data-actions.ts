'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { currentUser } from '@/lib/session';
import { can } from '@/lib/rbac';
import { INGESTIBLE, isIngestible, runIngest, type IngestSummary } from '@/lib/market-data.server';
import { recordForecast } from '@/lib/forecast-queries';
import { importAllAssociations, importAssociation, type ImportSummary } from '@/lib/associations.server';

/**
 * Admin actions for the market-data console.
 *
 * Ingestion is deliberately operator-triggered rather than automatic: these
 * calls hit third-party public APIs, and a background job that quietly hammers
 * UN Comtrade on every deploy is how free endpoints get revoked. A scheduler
 * would call the same `runIngest` entry point.
 */

export type MarketDataActionState = {
  error?: string;
  ok?: boolean;
  summaries?: IngestSummary[];
  recorded?: number;
  imports?: ImportSummary[];
  /** True when the import only previewed; nothing was written. */
  dryRun?: boolean;
};

/** Ingestion writes market-wide data, so it sits behind `admin:moderate`. */
async function requireOperator() {
  const user = await currentUser();
  if (!user || !can(user.principal, 'admin:moderate')) return null;
  return user;
}

function revalidateMarketData() {
  revalidatePath('/[locale]/admin/market-data', 'page');
  revalidatePath('/[locale]/analytics', 'page');
  revalidatePath('/[locale]/analytics/[cas]', 'page');
}

export async function ingestSourceAction(_prev: MarketDataActionState, formData: FormData): Promise<MarketDataActionState> {
  const user = await requireOperator();
  if (!user) return { error: 'forbidden' };

  const source = String(formData.get('source') ?? '');
  const sources = source === 'all' ? [...INGESTIBLE] : isIngestible(source) ? [source] : null;
  if (!sources) return { error: 'unknownSource' };

  const summaries: IngestSummary[] = [];
  for (const s of sources) {
    // Sequential, not Promise.all: two of these hit the same upstream host, and
    // a failure in one must not abort the others.
    summaries.push(await runIngest(s));
  }

  await prisma.auditLog.create({
    data: {
      action: 'marketData.ingest',
      entity: 'IngestRun',
      entityId: sources.join(','),
      actorId: user.id,
      meta: JSON.stringify(summaries),
    },
  });

  revalidateMarketData();
  return { ok: true, summaries };
}

/**
 * Snapshots today's forecast for every molecule with data, so it can be scored
 * against reality later. Without this the scoreboard can never fill in.
 */
export async function recordForecastsAction(): Promise<MarketDataActionState> {
  const user = await requireOperator();
  if (!user) return { error: 'forbidden' };

  const molecules = await prisma.priceObservation.findMany({ select: { cas: true }, distinct: ['cas'] });
  let recorded = 0;
  for (const { cas } of molecules) recorded += await recordForecast(cas);

  await prisma.auditLog.create({
    data: { action: 'marketData.recordForecasts', entity: 'PriceForecast', entityId: String(recorded), actorId: user.id },
  });

  revalidateMarketData();
  return { ok: true, recorded };
}

/**
 * Imports trade-association member registers.
 *
 * Defaults to a dry run: the operator sees what would be created before
 * anything is. Only an explicit `apply` writes, and even then the organisations
 * land as drafts in the verification queue — association membership is not a
 * GMP certificate and must not shortcut the check.
 */
export async function importAssociationsAction(_prev: MarketDataActionState, formData: FormData): Promise<MarketDataActionState> {
  const user = await requireOperator();
  if (!user) return { error: 'forbidden' };

  const which = String(formData.get('association') ?? 'all');
  const dryRun = String(formData.get('mode') ?? 'preview') !== 'apply';

  const imports = which === 'all' ? await importAllAssociations({ dryRun }) : [await importAssociation(which, { dryRun })];

  await prisma.auditLog.create({
    data: {
      action: dryRun ? 'association.import.preview' : 'association.import.apply',
      entity: 'Organization',
      entityId: which,
      actorId: user.id,
      meta: JSON.stringify(imports),
    },
  });

  revalidateMarketData();
  revalidatePath('/[locale]/admin', 'page');
  return { ok: true, imports, dryRun };
}
