import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/session';
import { VerificationBanner } from '@/components/verification-banner';
import { StatCard } from '@/components/stat-card';
import { StatusBadge } from '@/components/status-badge';
import { QuoteForm } from '@/components/quote-form';
import { ConfirmSubmit } from '@/components/confirm-submit';
import { declineRfqAction } from '@/lib/actions';
import { effectiveRfqStatus } from '@/lib/rfq';
import { getSellerNegotiations } from '@/lib/fulfillment-queries';
import { prepareThread } from '@/lib/negotiation';
import { NegotiationPanel } from '@/components/negotiation-panel';
import { getSellerSampleRequests } from '@/lib/sample-queries';
import { nextSellerSampleStatuses } from '@/lib/samples';
import { updateSampleAction } from '@/lib/sample-actions';
import { ActionForm } from '@/components/action-form';
import { ActionSubmit } from '@/components/action-submit';

// Renders per-user data (session, org plan, quotas) — must never be served
// from the static/full route cache.
export const dynamic = 'force-dynamic';


export default async function SellerDashboard({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireRole(locale, ['seller', 'both']);
  const t = await getTranslations('sellerDash');
  const tq = await getTranslations('quote');
  const tr = await getTranslations('rfq');
  const tn = await getTranslations('negotiate');
  const format = await getFormatter();

  const negotiations = user.orgId ? await getSellerNegotiations(user.orgId) : [];
  const samples = user.orgId ? await getSellerSampleRequests(user.orgId) : [];
  const ts = await getTranslations('samples');

  const org = user.orgId
    ? await prisma.organization.findUnique({ where: { id: user.orgId }, select: { status: true, rejectedReason: true } })
    : null;

  // Inquiries = RFQs this supplier was broadcast to (F4.2).
  const [inquiries, myQuotes, liveProducts] = await Promise.all([
    prisma.rfq.findMany({
      where: { broadcasts: { some: { orgId: user.orgId ?? '' } } },
      include: {
        buyerOrg: { select: { name: true, status: true } },
        quotes: { where: { sellerOrgId: user.orgId ?? '' } },
        broadcasts: { where: { orgId: user.orgId ?? '' }, select: { declinedAt: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.quote.findMany({ where: { sellerOrgId: user.orgId ?? '' } }),
    prisma.product.count({ where: { orgId: user.orgId ?? '', status: 'live' } }),
  ]);

  // Needs a quote = broadcast to us, still open, not yet quoted, not declined.
  const needsQuote = inquiries.filter(
    (r) => r.quotes.length === 0 && !r.broadcasts[0]?.declinedAt && ['open', 'quoted'].includes(effectiveRfqStatus(r))
  ).length;
  // A quote is still marked 'accepted' when it wins (the RFQ is 'awarded').
  const won = myQuotes.filter((q) => q.status === 'accepted').length;
  const winRate = myQuotes.length ? Math.round((won / myQuotes.length) * 100) : 0;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <h1 className="mb-6 text-2xl font-extrabold">{t('welcome')}</h1>

      <VerificationBanner status={org?.status as never} role={user.role} reason={org?.rejectedReason} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t('openInquiries')} value={needsQuote} testId="stat-inquiries" />
        <StatCard label={t('quotesSubmitted')} value={myQuotes.length} testId="stat-quotes-sent" />
        <StatCard label={t('winRate')} value={`${winRate}%`} />
        <StatCard label={t('liveProducts')} value={liveProducts} testId="stat-live-products" />
      </div>

      {/* Buyer counter-offers awaiting the seller */}
      {negotiations.length > 0 && (
        <section className="mt-8" data-testid="seller-negotiations">
          <h2 className="mb-3 text-base font-bold">{tn('title')} ({negotiations.length})</h2>
          <ul className="space-y-3">
            {negotiations.map((q) => {
              const thread = prepareThread(q.counters, user.orgId ?? '');
              return (
                <li key={q.id} className="card">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold">
                      {q.rfq.reference} · {q.rfq.productName}
                    </span>
                    <span className="font-mono text-sm text-brand">{q.currency} {q.unitPrice}/kg</span>
                  </div>
                  <NegotiationPanel quoteId={q.id} currency={q.currency} rows={thread.rows} canRespondId={thread.canRespondId} canProposeFlag={thread.canProposeFlag} />
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Sample requests from buyers */}
      {samples.length > 0 && (
        <section className="mt-8" data-testid="seller-samples">
          <h2 className="mb-3 text-base font-bold">{ts('sampleRequests')} ({samples.length})</h2>
          <ul className="space-y-2">
            {samples.map((s) => {
              const next = nextSellerSampleStatuses(s.status);
              return (
                <li key={s.id} className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-white p-3" data-testid="sample-row">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold">{s.product.name}</p>
                    <p className="text-xs text-muted">
                      {s.buyerOrg.name} · {s.buyerOrg.country}
                      {s.quantityG ? ` · ${s.quantityG} g` : ''}
                    </p>
                  </div>
                  <span className={s.status === 'shipped' ? 'badge-verified' : s.status === 'declined' ? 'badge-rejected' : 'badge-pending'}>
                    {ts(`st_${s.status}`)}
                  </span>
                  {next.map((n) => (
                    <ActionForm key={n} action={updateSampleAction}>
                      <input type="hidden" name="id" value={s.id} />
                      <input type="hidden" name="status" value={n} />
                      {/* ActionSubmit, not a bare button: it disables itself
                          while the action is in flight. Approving and shipping
                          are two clicks in the same row, and the refresh after
                          the first one replaces this subtree — a second click
                          landing in that window hits a node on its way out and
                          is simply lost. Disabling makes the button unavailable
                          until the new one is on screen. */}
                      <ActionSubmit
                        label={ts(`action_${n}`)}
                        className="text-xs font-semibold text-brand hover:underline disabled:opacity-50"
                        testId={`sample-${n}-${s.id}`}
                      />
                    </ActionForm>
                  ))}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <h2 className="mb-3 mt-8 text-base font-bold">{t('inquiryPipeline')}</h2>
      {inquiries.length === 0 ? (
        <div className="card py-12 text-center text-sm text-muted" data-testid="no-inquiries">
          {t('noInquiries')}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-card border border-line bg-white">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">RFQ</th>
                <th className="th">Buyer</th>
                <th className="th">Product</th>
                <th className="th">Qty</th>
                <th className="th">Due</th>
                <th className="th">Status</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody>
              {inquiries.map((r) => {
                const mine = r.quotes[0];
                const declined = !!r.broadcasts[0]?.declinedAt;
                const eff = effectiveRfqStatus(r); // 'expired' once required-by passes
                const open = eff === 'open' || eff === 'quoted';
                return (
                  <tr key={r.id} data-testid="inquiry-row">
                    <td className="td font-mono text-xs font-bold">{r.reference}</td>
                    <td className="td">
                      {r.buyerOrg.name} {r.buyerOrg.status === 'verified' && <span className="badge-verified">✓</span>}
                    </td>
                    <td className="td">
                      {r.productName}
                      <span className="block font-mono text-xs text-muted">CAS {r.cas}</span>
                    </td>
                    <td className="td">{r.quantityKg} kg</td>
                    <td className="td text-xs text-muted">{format.dateTime(r.requiredBy, { dateStyle: 'medium' })}</td>
                    <td className="td">
                      {mine ? (
                        <StatusBadge status={mine.status} />
                      ) : declined ? (
                        <StatusBadge status="declined" />
                      ) : eff === 'expired' || eff === 'cancelled' ? (
                        <StatusBadge status={eff} />
                      ) : (
                        <span className="badge-pending">● {t('needsQuote')}</span>
                      )}
                    </td>
                    <td className="td">
                      {mine ? (
                        <span className="font-mono text-xs text-muted">
                          {mine.currency} {mine.unitPrice}/kg
                        </span>
                      ) : declined || !open ? (
                        <span className="text-xs text-muted">—</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <QuoteForm rfqId={r.id} product={r.productName} buyer={r.buyerOrg.name} label={tq('submitTitle')} />
                          <ActionForm action={declineRfqAction}>
                            <input type="hidden" name="rfqId" value={r.id} />
                            <ConfirmSubmit
                              className="text-xs font-semibold text-muted hover:text-red-700"
                              confirm={tr('declineTitle')}
                              label={tr('decline')}
                              testId={`decline-${r.reference}`}
                            />
                          </ActionForm>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
