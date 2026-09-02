import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireRole } from '@/lib/session';
import { searchPartners } from '@/lib/partner-queries';
import { PARTNER_ARCHETYPES, PARTNER_TIERS, TIER_BADGE_CLASS } from '@/lib/partner';
import { CompanyLogo } from '@/components/company-logo';
import { Link } from '@/i18n/routing';

// Renders per-request search results — must never be served from the
// static/full route cache.
export const dynamic = 'force-dynamic';

export default async function PartnersSearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ archetype?: string; tier?: string; country?: string }>;
}) {
  const { locale } = await params;
  const filters = await searchParams;
  setRequestLocale(locale);
  await requireRole(locale, ['buyer', 'both']);
  const t = await getTranslations('partnerSearch');
  const tp = await getTranslations('partnerProfile');

  const results = await searchPartners(filters);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-extrabold">{t('title')}</h1>
      <p className="mb-6 mt-1 text-sm text-muted">{t('subtitle')}</p>

      <form className="card mb-6 flex flex-wrap items-end gap-4" data-testid="partner-search-filters">
        <div>
          <label className="label" htmlFor="archetype">
            {t('filterArchetype')}
          </label>
          <select id="archetype" name="archetype" defaultValue={filters.archetype ?? ''} className="input">
            <option value="">{t('filterAny')}</option>
            {PARTNER_ARCHETYPES.map((a) => (
              <option key={a} value={a}>
                {tp(`archetype_${a}`)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="tier">
            {t('filterTier')}
          </label>
          <select id="tier" name="tier" defaultValue={filters.tier ?? ''} className="input">
            <option value="">{t('filterAny')}</option>
            {PARTNER_TIERS.map((tier) => (
              <option key={tier} value={tier}>
                {tp(`tier_${tier}`)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="country">
            {t('filterCountry')}
          </label>
          <input id="country" name="country" defaultValue={filters.country ?? ''} className="input" placeholder="India" />
        </div>
        <button type="submit" className="btn-primary">
          {t('filterApply')}
        </button>
      </form>

      {results.length === 0 ? (
        <div className="card py-14 text-center text-sm text-muted" data-testid="no-partner-results">
          {t('noResults')}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((p) => (
            <Link
              key={p.id}
              href={`/partners/${p.id}`}
              className="card flex flex-col gap-3 transition hover:-translate-y-0.5 hover:shadow-lg"
              data-testid="partner-result-card"
            >
              <div className="flex items-center gap-3">
                <CompanyLogo name={p.org.name} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{p.org.name}</p>
                  <p className="text-xs text-muted">
                    {p.org.city ? `${p.org.city}, ` : ''}
                    {p.org.country}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={TIER_BADGE_CLASS}>{tp(`tier_${p.tier}`)}</span>
                <span className="badge-neutral">{tp(`archetype_${p.archetype}`)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
