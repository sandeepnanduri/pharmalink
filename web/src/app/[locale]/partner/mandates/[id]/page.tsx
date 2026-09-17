import { notFound } from 'next/navigation';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { requireRole } from '@/lib/session';
import { getPartnerMandateComparison, getPartnerQuoteMandateDetail } from '@/lib/partner-queries';
import { MatchBreakdown } from '@/components/match-breakdown';
import { StatusBadge } from '@/components/status-badge';

export const dynamic = 'force-dynamic';

/**
 * Read-only mandate detail for a partner. Deliberately imports neither
 * acceptQuoteAction nor ConfirmSubmit — the PARTNER BOUNDARY (see the comment
 * above acceptQuoteAction in lib/actions.ts) means a partner drafts but never
 * accepts, and this page has no code path that could ever change that,
 * mirroring the source-scan discipline actions.partner-boundary.test.ts
 * already applies to actions.ts itself.
 *
 * Tries the RFQ-comparison branch first, then the single-quote branch — an
 * `id` here is either an Rfq or a Quote id, and ownership (draftedByPartnerId)
 * is what actually decides which, not a route param.
 */
export default async function PartnerMandateDetailPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireRole(locale, ['partner']);
  const t = await getTranslations('compareQuotes');
  const tm = await getTranslations('partnerMandate');
  const format = await getFormatter();

  const rfqData = user.orgId ? await getPartnerMandateComparison(user.orgId, id) : null;
  if (rfqData) {
    const { rfq, quotes, rows } = rfqData;

    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <Link href="/partner/mandates" className="text-xs font-semibold text-violet hover:underline">
          ← {tm('listTitle')}
        </Link>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">{t('title')}</h1>
            <p className="mt-1 text-sm text-slate2">
              {rfq.productName} · <span className="font-mono text-xs">{rfq.cas}</span> · {rfq.quantityKg} kg ·{' '}
              {t('requiredBy', { date: format.dateTime(rfq.requiredBy, { dateStyle: 'medium' }) })}
            </p>
          </div>
          <span className="rounded-pill bg-mist px-3 py-1 font-mono text-xs font-semibold text-slate2">{rfq.reference}</span>
        </div>

        <p className="mt-3 text-xs font-semibold text-violet-deep">{tm('readOnlyNote')}</p>

        {quotes.length === 0 ? (
          <div className="card mt-4 py-14 text-center" data-testid="compare-empty">
            <p className="text-sm font-semibold">{t('emptyTitle')}</p>
            <p className="mx-auto mt-1 max-w-md text-xs text-muted">{t('emptyBody')}</p>
          </div>
        ) : (
          <>
            <div className="mt-6 overflow-x-auto rounded-card border border-line bg-white">
              <table className="w-full text-sm" data-testid="compare-table">
                <thead>
                  <tr>
                    <th className="th sticky left-0 z-10 bg-mist" style={{ minWidth: 190 }}>
                      {t('attribute')}
                    </th>
                    {quotes.map((q) => (
                      <th key={q.id} className="th" style={{ minWidth: 210 }}>
                        <div className="flex flex-col gap-1">
                          <span className="text-[13px] font-bold normal-case tracking-normal text-ink">{q.supplier}</span>
                          <span className="text-[11px] font-normal normal-case tracking-normal text-muted">{q.country ?? '—'}</span>
                          {q.flaggedMarkup && (
                            <span
                              className="w-fit rounded-pill bg-danger-pale px-2 py-0.5 text-[10px] font-bold text-danger"
                              data-testid={`markup-flag-${q.id}`}
                              title={t('markupFlagTitle')}
                            >
                              {t('markupFlag')}
                            </span>
                          )}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.key} data-testid="compare-row" data-differs={r.differs}>
                      <td className="td sticky left-0 z-10 bg-white">
                        <span className="flex items-center gap-2 text-xs font-semibold text-slate2">
                          {r.label}
                          {r.differs && <span className="h-1.5 w-1.5 rounded-full bg-gold" title={t('differs')} aria-label={t('differs')} />}
                        </span>
                      </td>
                      {r.values.map((v, i) => (
                        <td key={`${r.key}-${quotes[i].id}`} className={`td ${r.numeric ? 'font-mono tabular-nums' : ''} ${r.best === i ? 'font-bold text-ok' : ''}`}>
                          {v ?? <span className="text-muted">—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {/* No award row: the represented buyer accepts, not the
                      partner — this table has no form anywhere in it. */}
                  <tr>
                    <td className="td sticky left-0 z-10 bg-white text-xs font-semibold text-slate2">{t('decision')}</td>
                    {quotes.map((q) => (
                      <td key={`status-${q.id}`} className="td">
                        <StatusBadge status={rfqData.awardedQuoteId === q.id ? 'awarded' : q.status} />
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>

            <h2 className="mt-8 font-display text-base font-bold">{t('howScored')}</h2>
            <p className="mb-3 mt-1 max-w-3xl text-xs text-muted">{t('howScoredNote')}</p>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {quotes.map((q) => (
                <MatchBreakdown key={`bd-${q.id}`} supplier={q.supplier} result={q.match} />
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  const quote = user.orgId ? await getPartnerQuoteMandateDetail(user.orgId, id) : null;
  if (!quote) notFound();

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <Link href="/partner/mandates" className="text-xs font-semibold text-violet hover:underline">
        ← {tm('listTitle')}
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">{quote.rfq.productName}</h1>
          <p className="mt-1 text-sm text-slate2">
            <span className="font-mono text-xs">{quote.rfq.cas}</span> · {quote.rfq.quantityKg} kg · {tm('forBuyer', { buyer: quote.rfq.buyerOrg.name })}
          </p>
        </div>
        <span className="rounded-pill bg-mist px-3 py-1 font-mono text-xs font-semibold text-slate2">{quote.rfq.reference}</span>
      </div>

      <p className="mt-3 text-xs font-semibold text-violet-deep">{tm('readOnlyNote')}</p>

      <div className="card mt-6 space-y-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase text-muted">{t('decision')}</span>
          <StatusBadge status={quote.status} />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase text-muted">{tm('unitPrice')}</span>
          <span className="font-mono font-semibold">
            {quote.currency} {quote.unitPrice}/kg
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase text-muted">{tm('validUntil')}</span>
          <span>{format.dateTime(quote.validUntil, { dateStyle: 'medium' })}</span>
        </div>
      </div>
    </div>
  );
}
