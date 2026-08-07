import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { searchCatalog } from '@/lib/catalog-queries';
import { getSupplierRatings } from '@/lib/social-queries';
import { FILTER_SECTIONS, QUICK_CHIPS, SORTS, activeCount, parseFilters } from '@/lib/filters';
import { segment } from '@/lib/taxonomy';
import { Stars } from '@/components/stars';
import { FilterRail } from '@/components/filter-rail';
import { CompanyLogo } from '@/components/company-logo';

type SP = Record<string, string | string[] | undefined>;

/**
 * The catalogue.
 *
 * Filters live in the URL, so a result set is shareable, bookmarkable and
 * survives the back button — a procurement head sends "here is the shortlist"
 * as a link, not a screenshot.
 */
export default async function CatalogPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SP>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const t = await getTranslations('catalog');

  const filters = parseFilters(sp);
  const active = activeCount(filters);
  const { products, total, supplierCount, counts, interpretedAs } = await searchCatalog(filters);
  const ratings = await getSupplierRatings([...new Set(products.map((p) => p.orgId))]);

  // Country options come from the data, not a hard-coded list that goes stale.
  const countryOptions = Object.keys(counts.countries)
    .sort()
    .map((c) => ({ value: c, label: c }));
  const sections = FILTER_SECTIONS.map((s) => (s.key === 'country' ? { ...s, options: countryOptions } : s));

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">{t('title')}</h1>
          <p className="mt-1 text-sm text-slate2" data-testid="catalog-summary">
            {t('resultSummary', { count: total, suppliers: supplierCount })}
            {interpretedAs && (
              <span className="ml-2 rounded-pill bg-accent-pale px-2 py-0.5 text-[11px] font-semibold text-accent-dark">
                {t('interpretedAs', { term: interpretedAs })}
              </span>
            )}
          </p>
        </div>
        <Link href="/buyer/rfqs/new" className="btn-primary">
          {t('newRfq')}
        </Link>
      </div>

      {/* Quick chips — each maps to real filters; none is a badge we cannot back. */}
      <div className="mb-5 flex flex-wrap gap-2" data-testid="quick-chips">
        {QUICK_CHIPS.map((c) => {
          const qs = new URLSearchParams();
          for (const [k, v] of Object.entries(c.params)) (Array.isArray(v) ? v : [v]).forEach((x) => qs.append(k, x));
          return (
            <a
              key={c.id}
              href={`?${qs}`}
              className="rounded-pill border border-line bg-white px-3 py-1.5 text-xs font-semibold text-slate2 transition hover:border-brand hover:text-brand"
            >
              {c.label}
            </a>
          );
        })}
      </div>

      <form method="get" className="grid gap-6 lg:grid-cols-[252px_1fr]">
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <FilterRail sections={sections} filters={filters} counts={counts} activeTotal={active} />
        </aside>

        <div>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <input
              name="q"
              defaultValue={filters.q}
              placeholder={t('searchPlaceholder')}
              className="input flex-1"
              data-testid="catalog-search"
              aria-label={t('searchPlaceholder')}
            />
            <select name="sort" defaultValue={filters.sort} className="input !w-auto shrink-0" data-testid="catalog-sort" aria-label={t('sortLabel')}>
              {Object.entries(SORTS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
            <button type="submit" className="btn-ghost shrink-0">
              {t('search')}
            </button>
          </div>

          {products.length === 0 ? (
            <div className="card py-16 text-center" data-testid="catalog-empty">
              <p className="font-display text-base font-bold">{t('emptyTitle')}</p>
              <p className="mx-auto mt-1.5 max-w-sm text-sm text-slate2">
                {active > 0 ? t('emptyWithFilters', { count: active }) : t('emptyNoFilters')}
              </p>
              {active > 0 && (
                <a href="?" className="btn-ghost mt-4 inline-flex">
                  {t('clearFilters')}
                </a>
              )}
            </div>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" data-testid="catalog-results">
              {products.map((p) => {
                const seg = segment(p.productType);
                const blocking = p.org.regulatoryActions.some((a) => a.kind === 'import_alert' || a.kind === 'eu_noncompliance');
                return (
                  <li key={p.id}>
                    <Link href={`/products/${p.id}`} className="card block h-full transition hover:shadow-lg" data-testid="product-card">
                      <div className="flex items-start gap-3">
                        <CompanyLogo name={p.org.name} website={p.org.website} logoUrl={p.org.logoUrl} size={40} />
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate font-semibold leading-snug">{p.name}</h3>
                          <p className="truncate text-xs text-muted">
                            {p.org.name} · {p.org.country}
                          </p>
                        </div>
                      </div>

                      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                        <div className="flex justify-between gap-2">
                          <dt className="text-muted">CAS</dt>
                          <dd className="font-mono text-slate2">{p.cas}</dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt className="text-muted">{t('moq')}</dt>
                          <dd className="font-mono text-slate2">{p.moqKg} kg</dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt className="text-muted">{t('grade')}</dt>
                          <dd className="truncate font-mono text-slate2">{p.grade ?? '—'}</dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt className="text-muted">{t('price')}</dt>
                          <dd className="font-mono font-semibold text-ink">
                            {p.priceMin ? `$${p.priceMin}${p.priceMax ? `–${p.priceMax}` : ''}` : '—'}
                          </dd>
                        </div>
                      </dl>

                      <div className="mt-3 flex flex-wrap items-center gap-1.5">
                        {seg && <span className="rounded-pill bg-mist px-2 py-0.5 text-[10.5px] font-semibold text-slate2">{seg.label}</span>}
                        {p.org.certifications.slice(0, 2).map((c) => (
                          <span key={c.name} className="rounded-pill bg-ok-pale px-2 py-0.5 text-[10.5px] font-semibold text-ok">
                            {c.name}
                          </span>
                        ))}
                        {/* A blocking regulatory action is surfaced on the card,
                            not buried in the profile — it changes the decision. */}
                        {blocking && (
                          <span className="rounded-pill bg-danger-pale px-2 py-0.5 text-[10.5px] font-bold text-danger" data-testid="card-blocked">
                            {t('regulatoryFlag')}
                          </span>
                        )}
                      </div>

                      {ratings[p.orgId] && (
                        <div className="mt-2.5 border-t border-line pt-2.5">
                          <Stars average={ratings[p.orgId].average} count={ratings[p.orgId].count} />
                        </div>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </form>
    </div>
  );
}
