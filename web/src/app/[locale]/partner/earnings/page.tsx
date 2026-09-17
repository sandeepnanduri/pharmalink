import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { requireRole } from '@/lib/session';
import { getPartnerEarnings, getPartnerCommissionLedger } from '@/lib/partner-queries';
import { StatCard } from '@/components/stat-card';
import { Link } from '@/i18n/routing';

// Renders per-user data (session, payouts) — must never be served from the
// static/full route cache.
export const dynamic = 'force-dynamic';

const STATUS_BADGE: Record<string, string> = {
  accrued: 'badge-pending',
  confirmed: 'badge-info',
  paid: 'badge-verified',
  void: 'badge-neutral',
};

const KIND_LABEL: Record<string, string> = {
  // 'model_b_bounty' ships with N7.11 (P2) — not written by any code path
  // yet, so it's not listed here either.
  model_a_margin: 'kindModelA',
};

export default async function PartnerEarningsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireRole(locale, ['partner']);
  const t = await getTranslations('partnerEarnings');
  const format = await getFormatter();

  const earnings = user.orgId ? await getPartnerEarnings(user.orgId) : null;
  const ledger = user.orgId ? await getPartnerCommissionLedger(user.orgId) : null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">{t('title')}</h1>
          <p className="mt-1 text-sm text-muted">{t('subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/partner/earnings/statement/print" className="btn-ghost !py-2 text-xs" data-testid="gmv-statement-link">
            {t('gmvStatementCta')}
          </Link>
          {/* A file download from an API route, not a page navigation — see seller/products/page.tsx's identical export link. */}
          <a href="/api/partner/ledger-export" className="btn-ghost !py-2 text-xs" data-testid="ledger-export-link" download>
            {t('ledgerExportCta')}
          </a>
        </div>
      </div>

      {/* The A1 boundary, stated plainly — never implied by omission. */}
      <div className="mb-6 flex items-center gap-2.5 rounded-panel border border-line bg-white px-4 py-3">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-muted">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v5M12 16.5h.01" strokeLinecap="round" />
        </svg>
        <p className="text-xs text-slate2">{t('boundaryNote')}</p>
      </div>

      {!earnings ? (
        <div className="card py-12 text-center text-sm text-muted" data-testid="no-partner-record">
          {t('noPartnerRecord')}
        </div>
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2">
            <StatCard label={t('paidToDate')} value={`$${Math.round(earnings.paidTotal).toLocaleString()}`} testId="stat-paid" />
            <StatCard label={t('accruedPending')} value={`$${Math.round(earnings.accruedTotal).toLocaleString()}`} testId="stat-accrued" />
          </div>

          {earnings.payouts.length === 0 ? (
            <div className="card py-14 text-center text-sm text-muted" data-testid="no-payouts">
              {t('noPayouts')}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-card border border-line bg-white">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="th">{t('colNumber')}</th>
                    <th className="th">{t('colKind')}</th>
                    <th className="th">{t('colAmount')}</th>
                    <th className="th">{t('colStatus')}</th>
                    <th className="th">{t('colDate')}</th>
                    <th className="th" />
                  </tr>
                </thead>
                <tbody>
                  {earnings.payouts.map((p) => (
                    <tr key={p.id} data-testid="payout-row">
                      <td className="td font-mono text-xs">{p.number}</td>
                      <td className="td">{t(KIND_LABEL[p.kind] ?? 'kindOther')}</td>
                      <td className="td font-mono font-semibold">
                        {p.currency} {p.amount.toFixed(2)}
                      </td>
                      <td className="td">
                        <span className={STATUS_BADGE[p.status] ?? 'badge-neutral'}>{t(`status_${p.status}`)}</span>
                      </td>
                      <td className="td text-xs text-slate2">{format.dateTime(p.createdAt, { dateStyle: 'medium' })}</td>
                      <td className="td text-right">
                        <Link href={`/partner/earnings/${p.id}/print`} className="text-xs font-semibold text-violet hover:underline" data-testid={`view-invoice-${p.id}`}>
                          {t('viewInvoice')}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {ledger && ledger.entries.length > 0 && (
            <section className="mt-10">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-bold">{t('commissionLedgerTitle')}</h2>
                <div className="flex gap-4 text-xs text-slate2">
                  <span>
                    {t('commissionLedgerThisMonth')}: <span className="font-mono font-bold text-txt">${ledger.totalThisMonth.toFixed(2)}</span>
                  </span>
                  <span>
                    {t('commissionLedgerAllTime')}: <span className="font-mono font-bold text-txt">${ledger.totalAllTime.toFixed(2)}</span>
                  </span>
                </div>
              </div>
              <p className="mb-3 text-xs text-muted">{t('commissionLedgerHint')}</p>
              <div className="overflow-x-auto rounded-card border border-line bg-white">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="th">{t('colDeal')}</th>
                      <th className="th">{t('colBuyer')}</th>
                      <th className="th">{t('colSupplier')}</th>
                      <th className="th">{t('colCommission')}</th>
                      <th className="th">{t('colDate')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.entries.map((e) => (
                      <tr key={e.dealId} data-testid="commission-ledger-row">
                        <td className="td">
                          <p className="font-semibold">{e.productName}</p>
                          <p className="mt-0.5 font-mono text-[10.5px] text-muted">
                            {e.reference} · CAS {e.cas}
                          </p>
                        </td>
                        <td className="td text-xs">{e.buyerOrgName}</td>
                        <td className="td text-xs">{e.supplierOrgName}</td>
                        <td className="td font-mono font-semibold">
                          {e.currency} {e.totalCommission.toFixed(2)}
                          <span className="ml-1 font-sans text-[10.5px] font-normal text-muted">
                            ({e.quantityKg} kg × {e.commissionPerKg.toFixed(2)}/kg)
                          </span>
                        </td>
                        <td className="td text-xs text-slate2">{format.dateTime(e.createdAt, { dateStyle: 'medium' })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
