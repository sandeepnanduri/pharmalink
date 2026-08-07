import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { requireUser } from '@/lib/session';
import { redirect } from '@/i18n/routing';
import { can, opsLanding } from '@/lib/rbac';
import { MARKET_SOURCES } from '@/lib/market-data';
import { INGESTIBLE, latestRuns } from '@/lib/market-data.server';
import { MarketDataConsole, type SourceRow } from '@/components/market-data-console';

export const dynamic = 'force-dynamic';

/** Operator console for the external market-data connectors. */
export default async function MarketDataPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const actor = await requireUser(locale);
  if (!can(actor.principal, 'admin:moderate')) redirect({ href: opsLanding(actor.role), locale });

  const t = await getTranslations('marketData');
  const format = await getFormatter();
  const runs = await latestRuns();
  const stamp = (d: Date) => format.dateTime(d, { dateStyle: 'medium', timeStyle: 'short' });
  const ingestible = new Set<string>(INGESTIBLE);

  const sources: SourceRow[] = MARKET_SOURCES.map((s) => {
    const run = runs.get(s.id);
    return {
      id: s.id,
      name: s.name,
      kind: s.kind,
      status: s.status,
      licence: s.licence,
      yields: s.yields,
      docsUrl: s.docsUrl,
      ingestible: ingestible.has(s.id),
      lastRun: run ? { status: run.status, startedAt: stamp(run.startedAt), inserted: run.inserted, error: run.error } : null,
    };
  });

  // Platform activity is a source too, but it has no external page to link to.
  const internalRun = runs.get('internal');
  sources.unshift({
    id: 'internal',
    name: 'PharmaLink quotes & deals',
    kind: 'price',
    status: 'live',
    licence: 'Own data',
    yields: 'Submitted quotes and closed deals — the strongest evidence in the model',
    docsUrl: '/developers',
    ingestible: true,
    lastRun: internalRun
      ? { status: internalRun.status, startedAt: stamp(internalRun.startedAt), inserted: internalRun.inserted, error: internalRun.error }
      : null,
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-extrabold">{t('title')}</h1>
      <p className="mb-6 mt-1 max-w-3xl text-sm text-muted">{t('subtitle')}</p>
      <MarketDataConsole sources={sources} />
    </div>
  );
}
