import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireRole } from '@/lib/session';
import { getPortfolio, getQuotableMandates } from '@/lib/partner-queries';
import { QuoteForm } from '@/components/quote-form';
import { Link } from '@/i18n/routing';

// Renders per-user data (session, mandates, representations) — must never be
// served from the static/full route cache.
export const dynamic = 'force-dynamic';

export default async function MandatesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireRole(locale, ['partner']);
  const t = await getTranslations('partnerMandate');

  const [portfolio, quotable] = await Promise.all([
    user.orgId ? getPortfolio(user.orgId) : null,
    user.orgId ? getQuotableMandates(user.orgId) : [],
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold">{t('listTitle')}</h1>
          <p className="mt-1 text-sm text-muted">{t('listSubtitle')}</p>
        </div>
        <Link href="/partner/mandates/new" className="btn-violet">
          {t('newRfqCta')}
        </Link>
      </div>

      {quotable.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-base font-bold">{t('quotableTitle')}</h2>
          <p className="mb-3 text-xs text-muted">{t('quotableHint')}</p>
          <ul className="space-y-2">
            {quotable.map((q) => (
              <li key={`${q.rfqId}-${q.supplierOrgId}`} className="card flex flex-wrap items-center gap-3" data-testid="quotable-row">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold">
                    {q.productName} · {q.quantityKg} kg
                  </p>
                  <p className="text-xs text-muted">
                    {t('forBuyer', { buyer: q.buyerOrgName })} · {t('viaSupplier', { supplier: q.supplierOrgName })}
                  </p>
                  <p className="mt-1 font-mono text-[10.5px] text-muted">
                    {q.reference} · CAS {q.cas}
                  </p>
                </div>
                <QuoteForm rfqId={q.rfqId} product={q.productName} buyer={q.buyerOrgName} label={t('draftQuote')} actingForOrgId={q.supplierOrgId} actingForOrgName={q.supplierOrgName} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-base font-bold">{t('allMandatesTitle')}</h2>
        {!portfolio || portfolio.mandates.length === 0 ? (
          <div className="card py-12 text-center text-sm text-muted" data-testid="no-mandates">
            {t('noMandates')}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-card border border-line bg-white">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">{t('colProduct')}</th>
                  <th className="th">{t('colPrincipal')}</th>
                  <th className="th">{t('colStatus')}</th>
                  <th className="th">{t('colReference')}</th>
                </tr>
              </thead>
              <tbody>
                {portfolio.mandates.map((m) => (
                  <tr key={`${m.kind}-${m.id}`} data-testid="mandate-row">
                    <td className="td font-semibold">
                      {m.productName}
                      <p className="mt-0.5 font-mono text-[10.5px] font-normal text-muted">CAS {m.cas}</p>
                    </td>
                    <td className="td">{m.principalOrgName}</td>
                    <td className="td">
                      <span className={m.bucket === 'awarded' ? 'badge-verified' : m.bucket === 'quoted' ? 'badge-info' : 'badge-neutral'}>
                        {t(m.bucket)}
                      </span>
                    </td>
                    <td className="td font-mono text-xs">{m.reference}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
