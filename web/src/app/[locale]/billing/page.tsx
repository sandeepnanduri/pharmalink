import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { entitlements, parsePlan, remaining } from '@/lib/plans';
import { StatCard } from '@/components/stat-card';

// Renders per-user data (session, org plan, quotas) — must never be served
// from the static/full route cache.
export const dynamic = 'force-dynamic';


export default async function BillingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale);
  const t = await getTranslations('billing');
  const tp = await getTranslations('plans');
  const format = await getFormatter();

  const org = user.orgId
    ? await prisma.organization.findUnique({
        where: { id: user.orgId },
        select: { plan: true, planRenewsAt: true, country: true },
      })
    : null;

  const plan = parsePlan(org?.plan);
  const e = entitlements(plan);

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const [invoices, rfqsUsed, liveListings] = await Promise.all([
    prisma.invoice.findMany({ where: { orgId: user.orgId ?? '' }, orderBy: { issuedAt: 'desc' } }),
    prisma.rfq.count({ where: { buyerOrgId: user.orgId ?? '', createdAt: { gte: monthStart } } }),
    prisma.product.count({ where: { orgId: user.orgId ?? '', status: 'live' } }),
  ]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">{t('title')}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">{t('subtitle')}</p>
        </div>
        <Link href="/pricing" className="btn-primary">
          {t('managePlan')}
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card" data-testid="current-plan">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{tp('currentPlan')}</p>
          <p className="mt-1.5 font-display text-2xl font-extrabold">{tp(plan)}</p>
          <p className="mt-1 text-xs text-muted">
            {e.priceUsd === null ? tp('custom') : `$${e.priceUsd}${tp('perMonth')}`}
            {org?.planRenewsAt && ` · ${t('renews', { date: format.dateTime(org.planRenewsAt, { dateStyle: 'medium' }) })}`}
          </p>
        </div>
        <StatCard
          label={tp('rfqsPerMonth')}
          value={e.rfqsPerMonth === null ? tp('unlimited') : `${rfqsUsed} / ${e.rfqsPerMonth}`}
          hint={e.rfqsPerMonth === null ? undefined : `${remaining(plan, 'rfqsPerMonth', rfqsUsed)} left`}
          testId="usage-rfqs"
        />
        <StatCard
          label={tp('liveListings')}
          value={e.liveListings === null ? tp('unlimited') : `${liveListings} / ${e.liveListings}`}
          testId="usage-listings"
        />
      </div>

      <h2 className="mb-3 mt-8 text-base font-bold">{t('invoices')}</h2>
      {invoices.length === 0 ? (
        <div className="card py-12 text-center text-sm text-muted" data-testid="no-invoices">
          {t('noInvoices')}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-card border border-line bg-white">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">{t('number')}</th>
                <th className="th">{tp('currentPlan')}</th>
                <th className="th">{t('period')}</th>
                <th className="th">{t('amount')}</th>
                <th className="th">{t('statusLabel')}</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} data-testid="invoice-row">
                  <td className="td font-mono text-xs font-bold">{inv.number}</td>
                  <td className="td">{tp(parsePlan(inv.plan))}</td>
                  <td className="td text-xs text-muted">
                    {format.dateTime(inv.periodStart, { dateStyle: 'medium' })} –{' '}
                    {format.dateTime(inv.periodEnd, { dateStyle: 'medium' })}
                  </td>
                  <td className="td font-mono">
                    {inv.currency} {inv.amount.toLocaleString()}
                    {inv.taxRate > 0 && <span className="block text-[10px] text-muted">{t('tax', { rate: inv.taxRate })}</span>}
                  </td>
                  <td className="td">
                    <span className={inv.status === 'paid' ? 'badge-verified' : 'badge-pending'}>
                      {t(inv.status as 'issued' | 'paid' | 'void')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
