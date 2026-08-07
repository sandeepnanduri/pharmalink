import { notFound } from 'next/navigation';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/session';
import { acceptQuoteAction, sendMessageAction, cancelRfqAction } from '@/lib/actions';
import { StatusBadge } from '@/components/status-badge';
import { effectiveRfqStatus, canBeAwarded, canBeCancelled, isQuoteValid } from '@/lib/rfq';
import { ConfirmSubmit } from '@/components/confirm-submit';
import { getRfqTimeline } from '@/lib/fulfillment-queries';
import { prepareThread } from '@/lib/negotiation';
import { NegotiationPanel } from '@/components/negotiation-panel';

export default async function RfqDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { locale, id } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const user = await requireRole(locale, ['buyer', 'both']);
  const t = await getTranslations('rfq');
  const tprint = await getTranslations('print');
  const format = await getFormatter();

  const rfq = await prisma.rfq.findUnique({
    where: { id },
    include: {
      quotes: {
        include: {
          sellerOrg: { select: { name: true, country: true, certifications: { where: { status: 'verified' } } } },
          counters: { orderBy: { createdAt: 'asc' } },
        },
        orderBy: { unitPrice: 'asc' },
      },
      deal: true,
      messages: { include: { user: { select: { name: true } }, org: { select: { name: true } } }, orderBy: { createdAt: 'asc' } },
    },
  });
  if (!rfq) notFound();
  // Ownership check — a buyer may only open their own RFQ.
  if (rfq.buyerOrgId !== user.orgId) notFound();

  const timeline = await getRfqTimeline(id);
  const tt = await getTranslations('timeline');
  const negotiable = effectiveRfqStatus(rfq) === 'open' || effectiveRfqStatus(rfq) === 'quoted';
  const cheapest = rfq.quotes[0]?.id;
  const effective = effectiveRfqStatus(rfq); // stored status, or 'expired' if past required-by
  const isAwarded = effective === 'awarded';
  const awardable = canBeAwarded(rfq);
  const cancellable = canBeCancelled(rfq);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <p className="mb-3 text-xs text-muted">
        <Link href="/buyer/rfqs" className="font-semibold text-brand hover:underline">
          {t('myRfqs')}
        </Link>{' '}
        › {rfq.reference}
      </p>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">{rfq.productName}</h1>
          <p className="mt-1 text-sm text-muted">
            {rfq.reference} · {rfq.quantityKg} kg · CAS {rfq.cas} · {rfq.grade} ·{' '}
            {t('due')} {format.dateTime(rfq.requiredBy, { dateStyle: 'medium' })}
            {rfq.requiredCerts && ` · ${rfq.requiredCerts}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={effective} />
          {cancellable && (
            <form action={cancelRfqAction}>
              <input type="hidden" name="rfqId" value={rfq.id} />
              <input type="hidden" name="locale" value={locale} />
              <ConfirmSubmit
                className="btn-ghost !py-1.5 text-xs !text-red-700"
                confirm={t('cancelConfirm')}
                label={t('cancel')}
                testId="cancel-rfq"
              />
            </form>
          )}
        </div>
      </div>

      {sp.error === 'quoteExpired' && (
        <div className="mb-4 rounded-lg bg-danger-pale px-3 py-2 text-xs font-semibold text-red-700" data-testid="award-error">
          {t('errQuoteExpired')}
        </div>
      )}
      {sp.error === 'cannotAward' && (
        <div className="mb-4 rounded-lg bg-danger-pale px-3 py-2 text-xs font-semibold text-red-700" data-testid="award-error">
          {t('errCannotAward')}
        </div>
      )}
      {effective === 'expired' && !rfq.deal && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-warn-pale px-3 py-2.5 text-xs text-amber-900" data-testid="rfq-expired">
          {t('expiredNote')}
        </div>
      )}
      {effective === 'cancelled' && (
        <div className="mb-4 rounded-lg border border-red-300 bg-danger-pale px-3 py-2.5 text-xs text-red-900" data-testid="rfq-cancelled">
          {t('withdrawn')}
        </div>
      )}

      {rfq.deal && (
        <div className="mb-6 rounded-card border border-green-300 bg-ok-pale px-4 py-3" data-testid="deal-banner">
          <p className="text-sm font-bold text-green-900">✅ {t('dealCreated')} — {rfq.deal.reference}</p>
          <p className="mt-0.5 text-xs text-green-900">
            {t('total')}: {rfq.deal.currency} {rfq.deal.totalValue.toLocaleString()}
          </p>
        </div>
      )}

      {/* Lifecycle timeline — derived from real timestamps */}
      {timeline.length > 1 && (
        <section className="mb-6" data-testid="rfq-timeline">
          <h2 className="mb-2 text-base font-bold">{tt('title')}</h2>
          <ol className="flex flex-wrap gap-x-6 gap-y-2 border-l-2 border-line pl-4">
            {timeline.map((e, i) => (
              <li key={i} className="relative text-xs">
                <span className="absolute -left-[21px] top-0.5 h-2 w-2 rounded-full bg-brand" />
                <span className="font-semibold">{tt(e.key)}</span>
                {e.detail && <span className="text-muted"> · {e.detail}</span>}
                <span className="block text-muted">{format.dateTime(e.at, { dateStyle: 'medium' })}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-bold">
          {t('compare')} ({rfq.quotes.length})
        </h2>
        {rfq.quotes.length > 0 && (
          <div className="flex items-center gap-2">
            {/* Comparison earns its own screen once there is more than one quote —
                below that there is nothing to compare against. */}
            {rfq.quotes.length > 1 && (
              <Link href={`/buyer/rfqs/${rfq.id}/compare`} className="btn-ghost !py-2 text-xs" data-testid="compare-quotes">
                {t('compareSideBySide')}
              </Link>
            )}
            <Link href={`/buyer/rfqs/${rfq.id}/print`} className="btn-ghost !py-2 text-xs" data-testid="export-pdf">
              ⬇ {rfq.deal ? tprint('dealRecord') : tprint('exportPdf')}
            </Link>
          </div>
        )}
      </div>

      {rfq.quotes.length === 0 ? (
        <div className="card py-12 text-center text-sm text-muted" data-testid="no-quotes">
          {t('noQuotesYet')}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-card border border-line bg-white">
          <table className="w-full min-w-[720px]">
            <thead>
              <tr>
                <th className="th">Criteria</th>
                {rfq.quotes.map((q) => (
                  <th key={q.id} className={`th ${q.id === cheapest ? 'bg-ok-pale' : ''}`}>
                    {q.id === cheapest && <span className="block text-[9px] text-ok">Best price</span>}
                    {q.sellerOrg.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="td font-semibold text-slate2">{t('unitPrice')}</td>
                {rfq.quotes.map((q) => (
                  <td key={q.id} className={`td ${q.id === cheapest ? 'bg-ok-pale' : ''}`}>
                    <span className="font-mono font-bold text-brand">
                      {q.currency} {q.unitPrice}/kg
                    </span>
                  </td>
                ))}
              </tr>
              <tr>
                <td className="td font-semibold text-slate2">{t('total')}</td>
                {rfq.quotes.map((q) => (
                  <td key={q.id} className={`td font-mono ${q.id === cheapest ? 'bg-ok-pale' : ''}`}>
                    {q.currency} {(q.unitPrice * rfq.quantityKg).toLocaleString()}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="td font-semibold text-slate2">{t('leadTime')}</td>
                {rfq.quotes.map((q) => (
                  <td key={q.id} className={`td ${q.id === cheapest ? 'bg-ok-pale' : ''}`}>{q.leadTime}</td>
                ))}
              </tr>
              <tr>
                <td className="td font-semibold text-slate2">{t('quotesReceived')} MOQ</td>
                {rfq.quotes.map((q) => (
                  <td key={q.id} className={`td ${q.id === cheapest ? 'bg-ok-pale' : ''}`}>{q.moqKg} kg</td>
                ))}
              </tr>
              <tr>
                <td className="td font-semibold text-slate2">{t('incoterm')}</td>
                {rfq.quotes.map((q) => (
                  <td key={q.id} className={`td ${q.id === cheapest ? 'bg-ok-pale' : ''}`}>{q.incoterm}</td>
                ))}
              </tr>
              <tr>
                <td className="td font-semibold text-slate2">{t('paymentTerms')}</td>
                {rfq.quotes.map((q) => (
                  <td key={q.id} className={`td ${q.id === cheapest ? 'bg-ok-pale' : ''}`}>{q.paymentTerms}</td>
                ))}
              </tr>
              <tr>
                <td className="td font-semibold text-slate2">{t('requiredCerts')}</td>
                {rfq.quotes.map((q) => (
                  <td key={q.id} className={`td text-[11px] ${q.id === cheapest ? 'bg-ok-pale' : ''}`}>
                    {q.sellerOrg.certifications.map((c) => (
                      <span key={c.id} className="block">
                        ✓ {c.name}
                      </span>
                    ))}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="td font-semibold text-slate2">{t('validUntil')}</td>
                {rfq.quotes.map((q) => (
                  <td key={q.id} className={`td text-xs ${q.id === cheapest ? 'bg-ok-pale' : ''}`}>
                    {format.dateTime(q.validUntil, { dateStyle: 'medium' })}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="td" />
                {rfq.quotes.map((q) => (
                  <td key={q.id} className={`td ${q.id === cheapest ? 'bg-ok-pale' : ''}`}>
                    {q.status === 'accepted' ? (
                      <span className="badge-verified">✓ {t('awarded')}</span>
                    ) : isAwarded || !awardable ? (
                      <span className="badge-neutral">—</span>
                    ) : !isQuoteValid(q.validUntil) ? (
                      // A quote past its validity can't be awarded — show why.
                      <span className="badge-neutral" title={t('errQuoteExpired')} data-testid={`quote-expired-${q.id}`}>
                        {t('expired')}
                      </span>
                    ) : (
                      <form action={acceptQuoteAction}>
                        <input type="hidden" name="quoteId" value={q.id} />
                        <input type="hidden" name="locale" value={locale} />
                        <button type="submit" className="btn-primary !px-3 !py-1.5 text-xs" data-testid={`accept-${q.id}`}>
                          {t('acceptQuote')}
                        </button>
                      </form>
                    )}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Structured negotiation — counter-offers per quote */}
      {negotiable && rfq.quotes.length > 0 && (
        <section className="mt-8" data-testid="negotiation-section">
          <h2 className="mb-3 text-base font-bold">{t('negotiate')}</h2>
          <ul className="space-y-3">
            {rfq.quotes.map((q) => {
              const thread = prepareThread(q.counters, user.orgId);
              return (
                <li key={q.id} className="card">
                  <p className="text-sm font-bold">{q.sellerOrg.name}</p>
                  <NegotiationPanel quoteId={q.id} currency={q.currency} rows={thread.rows} canRespondId={thread.canRespondId} canProposeFlag={thread.canProposeFlag} />
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Per-RFQ message thread (F4.5) */}
      <h2 className="mb-3 mt-8 text-base font-bold">{t('messages')}</h2>
      <div className="card">
        <ul className="space-y-3">
          {rfq.messages.map((m) => (
            <li key={m.id} className={`max-w-[75%] rounded-xl px-3.5 py-2.5 text-sm ${m.orgId === user.orgId ? 'ml-auto bg-brand text-white' : 'border border-line bg-white'}`}>
              <p className={`mb-1 text-[11px] font-bold ${m.orgId === user.orgId ? 'text-white/75' : 'text-muted'}`}>
                {m.user.name ?? m.org.name}
              </p>
              {m.body}
            </li>
          ))}
          {rfq.messages.length === 0 && <li className="text-sm text-muted">—</li>}
        </ul>
        <form action={sendMessageAction} className="mt-4 flex gap-2">
          <input type="hidden" name="rfqId" value={rfq.id} />
          <input name="body" required placeholder={t('messagePlaceholder')} className="input" />
          <button type="submit" className="btn-primary shrink-0">
            {t('sendMessage')}
          </button>
        </form>
      </div>
    </div>
  );
}
