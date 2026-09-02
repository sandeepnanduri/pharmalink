import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { requireRole } from '@/lib/session';
import { getPartnerEarnings } from '@/lib/partner-queries';
import { StatCard } from '@/components/stat-card';

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

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-extrabold">{t('title')}</h1>
      <p className="mb-6 mt-1 text-sm text-muted">{t('subtitle')}</p>

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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
