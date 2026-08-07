import { notFound } from 'next/navigation';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { requireRole } from '@/lib/session';
import { getQuoteComparison } from '@/lib/compare-queries';
import { acceptQuoteAction } from '@/lib/actions';
import { ConfirmSubmit } from '@/components/confirm-submit';
import { MatchBreakdown } from '@/components/match-breakdown';

export const dynamic = 'force-dynamic';

/**
 * Side-by-side quote comparison.
 *
 * NOTE: no `loading.tsx` in this segment — it calls `notFound()`, and a loading
 * boundary commits a 200 shell before the 404 can be set (the soft-404 trap the
 * `buyer` segment already avoids).
 */
export default async function CompareQuotesPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireRole(locale, ['buyer', 'both']);
  const t = await getTranslations('compareQuotes');
  const format = await getFormatter();

  const data = await getQuoteComparison(id, user.orgId ?? '');
  if (!data) notFound();

  const { rfq, quotes, rows } = data;
  const cols = quotes.length;

  if (cols === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <Link href={`/buyer/rfqs/${id}`} className="text-xs font-semibold text-brand hover:underline">
          ← {t('backToRequest')}
        </Link>
        <div className="card mt-4 py-14 text-center" data-testid="compare-empty">
          <p className="text-sm font-semibold">{t('emptyTitle')}</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted">{t('emptyBody')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <Link href={`/buyer/rfqs/${id}`} className="text-xs font-semibold text-brand hover:underline">
        ← {t('backToRequest')}
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

      {rfq.requiredCerts.length > 0 && (
        <p className="mt-3 text-xs text-muted">
          {t('mandatory')}:{' '}
          {rfq.requiredCerts.map((c) => (
            <span key={c} className="mr-1.5 inline-flex items-center rounded-pill bg-ok-pale px-2 py-0.5 text-[11px] font-semibold text-ok">
              {c}
            </span>
          ))}
        </p>
      )}

      {/* The comparison grid. Rows where suppliers differ carry a marker, because
          finding the differences is the entire job of this screen. */}
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
                    {q.match.disqualified ? (
                      <span className="w-fit rounded-pill bg-danger-pale px-2 py-0.5 text-[10px] font-bold text-danger">{t('notEligible')}</span>
                    ) : (
                      q.match.score != null && (
                        <span className="w-fit rounded-pill bg-teal-pale px-2 py-0.5 font-mono text-[10px] font-bold text-ok">
                          {q.match.score}/100
                        </span>
                      )
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
                  <td
                    key={`${r.key}-${quotes[i].id}`}
                    className={`td ${r.numeric ? 'font-mono tabular-nums' : ''} ${r.best === i ? 'font-bold text-ok' : ''}`}
                  >
                    {v ?? <span className="text-muted">—</span>}
                  </td>
                ))}
              </tr>
            ))}

            {/* Award row — the decision this screen exists to support. */}
            <tr>
              <td className="td sticky left-0 z-10 bg-white text-xs font-semibold text-slate2">{t('decision')}</td>
              {quotes.map((q) => (
                <td key={`award-${q.id}`} className="td">
                  {data.awardedQuoteId === q.id ? (
                    <span className="rounded-pill bg-ok-pale px-2.5 py-1 text-[11px] font-bold text-ok">{t('awarded')}</span>
                  ) : data.awardedQuoteId || q.match.disqualified || !q.valid ? (
                    <span className="text-xs text-muted">{!q.valid ? t('expired') : q.match.disqualified ? t('notEligible') : '—'}</span>
                  ) : (
                    <form action={acceptQuoteAction}>
                      <input type="hidden" name="quoteId" value={q.id} />
                      <input type="hidden" name="locale" value={locale} />
                      <ConfirmSubmit
                        label={t('award')}
                        confirm={t('awardConfirm', { supplier: q.supplier, price: q.unitPrice.toFixed(2) })}
                        className="btn-primary !py-1.5 text-xs"
                        testId={`compare-award-${q.id}`}
                      />
                    </form>
                  )}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-[11px] text-muted">{t('landedCostNote')}</p>

      {/* Why each score is what it is — the score is only useful if it is auditable. */}
      <h2 className="mt-8 font-display text-base font-bold">{t('howScored')}</h2>
      <p className="mb-3 mt-1 max-w-3xl text-xs text-muted">{t('howScoredNote')}</p>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {quotes.map((q) => (
          <MatchBreakdown key={`bd-${q.id}`} supplier={q.supplier} result={q.match} />
        ))}
      </div>
    </div>
  );
}
