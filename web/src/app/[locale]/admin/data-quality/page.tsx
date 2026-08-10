import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { requireUser } from '@/lib/session';
import { Link, redirect } from '@/i18n/routing';
import { can, opsLanding } from '@/lib/rbac';
import { getDataQuality } from '@/lib/data-quality-queries';
import type { FreshnessBucket } from '@/lib/data-quality';

export const dynamic = 'force-dynamic';

/**
 * Whether the curated data is any good.
 *
 * The importer can add 46 companies in one upload; this page is how an operator
 * tells whether that made the catalogue better or merely bigger. Everything on
 * it is computed at read time — the template's "Outdated (>6 months)" status is
 * derived from `lastVerifiedAt` and never stored, because a stored freshness
 * flag is wrong the day after it is written.
 *
 * It is a work queue, so the worst-covered organisation is first.
 */

/** Coverage bands. Ranges, not a gradient — a band is something to act on. */
function coverageBadge(pct: number): string {
  if (pct >= 80) return 'badge-verified';
  if (pct >= 50) return 'badge-pending';
  return 'badge-rejected';
}

const FRESHNESS_BADGE: Record<FreshnessBucket, string> = {
  fresh: 'badge-verified',
  ageing: 'badge-pending',
  outdated: 'badge-rejected',
  never: 'badge-neutral',
};

export default async function DataQualityPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const actor = await requireUser(locale);
  if (!can(actor.principal, 'admin:moderate')) redirect({ href: opsLanding(actor.role), locale });

  const t = await getTranslations('dataQuality');
  const format = await getFormatter();
  const q = await getDataQuality();

  const unsourced = q.missingSource.organizations + q.missingSource.products + q.missingSource.sites + q.missingSource.filings;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6" data-testid="data-quality">
      <h1 className="text-2xl font-extrabold">{t('title')}</h1>
      <p className="mb-6 mt-1 max-w-3xl text-sm text-muted">{t('subtitle')}</p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{t('overallCoverage')}</p>
          <p className="mt-1 font-mono text-2xl font-bold tabular-nums" data-testid="overall-coverage">
            {q.overall.pct}%
          </p>
          <p className="mt-1 text-[11px] text-muted">{t('fieldsFilled', { filled: q.overall.filled, total: q.overall.total })}</p>
        </div>
        <div className="card">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{t('needsRecheck')}</p>
          <p className="mt-1 font-mono text-2xl font-bold tabular-nums">{q.freshnessCounts.outdated + q.freshnessCounts.never}</p>
          <p className="mt-1 text-[11px] text-muted">{t('needsRecheckHint')}</p>
        </div>
        <div className="card">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{t('unsourced')}</p>
          <p className="mt-1 font-mono text-2xl font-bold tabular-nums" data-testid="unsourced-count">
            {unsourced}
          </p>
          <p className="mt-1 text-[11px] text-muted">{t('unsourcedHint')}</p>
        </div>
        <div className="card">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{t('duplicates')}</p>
          <p className="mt-1 font-mono text-2xl font-bold tabular-nums">{q.duplicates.length}</p>
          <p className="mt-1 text-[11px] text-muted">{t('duplicatesHint')}</p>
        </div>
      </div>

      {/* Verification freshness */}
      <section className="mt-8" data-testid="freshness">
        <h2 className="mb-1 text-base font-bold">{t('freshnessTitle')}</h2>
        <p className="mb-3 max-w-3xl text-xs text-muted">{t('freshnessNote')}</p>
        <div className="card flex flex-wrap gap-2">
          {(['fresh', 'ageing', 'outdated', 'never'] as const).map((b) => (
            <span key={b} className={FRESHNESS_BADGE[b]}>
              {t(`fresh_${b}`)} · {q.freshnessCounts[b]}
            </span>
          ))}
        </div>
      </section>

      {/* Price corpus */}
      <section className="mt-8" data-testid="price-quality">
        <h2 className="mb-1 text-base font-bold">{t('priceTitle')}</h2>
        <p className="mb-3 max-w-3xl text-xs text-muted">{t('priceNote')}</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="card">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{t('observations')}</p>
            <p className="mt-1 font-mono text-xl font-bold tabular-nums">{q.prices.total}</p>
          </div>
          <div className="card">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{t('flaggedOutliers')}</p>
            <p className="mt-1 font-mono text-xl font-bold tabular-nums">{q.prices.excluded}</p>
          </div>
          <div className="card">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{t('unattributed')}</p>
            <p className="mt-1 font-mono text-xl font-bold tabular-nums">{q.prices.unattributed}</p>
            <p className="mt-1 text-[11px] text-muted">{t('unattributedHint')}</p>
          </div>
          <div className="card">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{t('confidenceMix')}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="badge-verified">H · {q.prices.confidence.HIGH}</span>
              <span className="badge-pending">M · {q.prices.confidence.MEDIUM}</span>
              <span className="badge-neutral">L · {q.prices.confidence.LOW}</span>
              {q.prices.confidence.unstated > 0 && <span className="badge-neutral">? · {q.prices.confidence.unstated}</span>}
            </div>
          </div>
        </div>
      </section>

      {/* Duplicate candidates */}
      {q.duplicates.length > 0 && (
        <section className="mt-8" data-testid="duplicate-candidates">
          <h2 className="mb-1 text-base font-bold">{t('duplicatesTitle')}</h2>
          <p className="mb-3 max-w-3xl text-xs text-muted">{t('duplicatesNote')}</p>
          <ul className="space-y-2">
            {q.duplicates.map((d) => (
              <li key={`${d.a.id}-${d.b.id}`} className="card flex flex-wrap items-center gap-3 py-3" data-testid="duplicate-row">
                <span className={d.reason === 'name' ? 'badge-pending' : 'badge-rejected'}>{t(`dupe_${d.reason}`)}</span>
                <Link href={`/suppliers/${d.a.id}`} className="text-sm font-semibold text-brand hover:underline">
                  {d.a.name}
                </Link>
                <span className="text-xs text-muted">{t('and')}</span>
                <Link href={`/suppliers/${d.b.id}`} className="text-sm font-semibold text-brand hover:underline">
                  {d.b.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Per-organisation */}
      <section className="mt-8">
        <h2 className="mb-1 text-base font-bold">{t('byOrgTitle')}</h2>
        <p className="mb-3 max-w-3xl text-xs text-muted">{t('byOrgNote', { count: q.orgs.length })}</p>
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="th">{t('organisation')}</th>
                <th className="th">{t('coverage')}</th>
                <th className="th">{t('records')}</th>
                <th className="th">{t('lastVerified')}</th>
                <th className="th">{t('unsourcedShort')}</th>
                <th className="th">{t('companyId')}</th>
              </tr>
            </thead>
            <tbody>
              {q.orgs.map((o) => (
                <tr key={o.orgId} data-testid="quality-row">
                  <td className="td">
                    <Link href={`/suppliers/${o.orgId}`} className="font-semibold text-brand hover:underline">
                      {o.name}
                    </Link>
                    <span className="ml-2 text-[11px] text-muted">{o.country}</span>
                  </td>
                  <td className="td">
                    <span className={coverageBadge(o.coverage.pct)}>{o.coverage.pct}%</span>
                  </td>
                  <td className="td text-xs text-muted">
                    {t('recordCounts', { products: o.products, sites: o.sites, filings: o.filings, contacts: o.contacts })}
                  </td>
                  <td className="td">
                    <span className={FRESHNESS_BADGE[o.freshness]}>{t(`fresh_${o.freshness}`)}</span>
                    {o.lastVerifiedAt && (
                      <span className="ml-2 text-[11px] text-muted">{format.dateTime(o.lastVerifiedAt, { dateStyle: 'medium' })}</span>
                    )}
                  </td>
                  <td className="td font-mono tabular-nums">{o.missingSource === 0 ? <span className="text-muted">—</span> : o.missingSource}</td>
                  <td className="td font-mono text-xs">{o.externalId ?? <span className="text-muted">{t('noCompanyId')}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
