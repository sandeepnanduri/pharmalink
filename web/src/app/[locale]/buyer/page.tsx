import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/session';
import { VerificationBanner } from '@/components/verification-banner';
import { StatCard } from '@/components/stat-card';
import { StatusBadge } from '@/components/status-badge';

// Renders per-user data (session, org plan, quotas) — must never be served
// from the static/full route cache.
export const dynamic = 'force-dynamic';


export default async function BuyerDashboard({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireRole(locale, ['buyer', 'both']);
  const t = await getTranslations('buyerDash');
  const tr = await getTranslations('rfq');

  const org = user.orgId
    ? await prisma.organization.findUnique({ where: { id: user.orgId }, select: { status: true, rejectedReason: true } })
    : null;

  const [rfqs, quoteCount, dealCount, supplierCount] = await Promise.all([
    prisma.rfq.findMany({
      where: { buyerOrgId: user.orgId ?? '' },
      include: { _count: { select: { quotes: true } } },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
    prisma.quote.count({ where: { rfq: { buyerOrgId: user.orgId ?? '' }, status: 'submitted' } }),
    prisma.deal.count({ where: { rfq: { buyerOrgId: user.orgId ?? '' } } }),
    prisma.organization.count({ where: { status: 'verified', kind: { in: ['seller', 'both'] } } }),
  ]);

  const activeCount = rfqs.filter((r) => ['open', 'quoted'].includes(r.status)).length;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold">{t('welcome', { name: user.name ?? user.email })}</h1>
        <Link href="/buyer/rfqs/new" className="btn-primary" data-testid="post-rfq-cta">
          ＋ {tr('newTitle')}
        </Link>
      </div>

      <VerificationBanner status={org?.status as never} role={user.role} reason={org?.rejectedReason} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t('activeRfqs')} value={activeCount} testId="stat-active-rfqs" />
        <StatCard label={t('quotesToReview')} value={quoteCount} testId="stat-quotes" />
        <StatCard label={t('dealsClosed')} value={dealCount} testId="stat-deals" />
        <StatCard label={t('verifiedSuppliers')} value={supplierCount} />
      </div>

      <div className="mt-8 rounded-card border border-line bg-white">
        <div className="flex items-center justify-between p-4">
          <h2 className="text-base font-bold">{t('recentRfqs')}</h2>
          <Link href="/buyer/rfqs" className="text-xs font-semibold text-brand hover:underline">
            {t('viewAll')} →
          </Link>
        </div>
        {rfqs.length === 0 ? (
          <p className="px-4 pb-6 text-sm text-muted">{tr('noRfqs')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">{tr('reference')}</th>
                  <th className="th">{tr('productName')}</th>
                  <th className="th">{tr('quantity')}</th>
                  <th className="th">{tr('quotesReceived')}</th>
                  <th className="th">Status</th>
                </tr>
              </thead>
              <tbody>
                {rfqs.map((r) => (
                  <tr key={r.id} className="hover:bg-brand-pale">
                    <td className="td">
                      <Link href={`/buyer/rfqs/${r.id}`} className="font-mono text-xs font-bold text-brand hover:underline">
                        {r.reference}
                      </Link>
                    </td>
                    <td className="td">
                      {r.productName}
                      <span className="block font-mono text-xs text-muted">CAS {r.cas}</span>
                    </td>
                    <td className="td">{r.quantityKg} kg</td>
                    <td className="td font-bold">{r._count.quotes}</td>
                    <td className="td">
                      <StatusBadge status={r.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
