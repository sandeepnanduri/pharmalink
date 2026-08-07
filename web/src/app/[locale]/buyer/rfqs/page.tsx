import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/session';
import { StatusBadge } from '@/components/status-badge';

// Renders per-user data (session, org plan, quotas) — must never be served
// from the static/full route cache.
export const dynamic = 'force-dynamic';


export default async function MyRfqsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireRole(locale, ['buyer', 'both']);
  const t = await getTranslations('rfq');
  const format = await getFormatter();

  const rfqs = await prisma.rfq.findMany({
    where: { buyerOrgId: user.orgId ?? '' },
    include: { _count: { select: { quotes: true } } },
    orderBy: { createdAt: 'desc' },
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t('myRfqs')}</h1>
        <Link href="/buyer/rfqs/new" className="btn-primary">
          ＋ {t('newTitle')}
        </Link>
      </div>

      {rfqs.length === 0 ? (
        <div className="card py-16 text-center">
          <p className="text-sm text-muted">{t('noRfqs')}</p>
          <Link href="/buyer/rfqs/new" className="btn-primary mt-4 inline-flex">
            {t('postFirst')}
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-card border border-line bg-white">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">{t('reference')}</th>
                <th className="th">{t('productName')}</th>
                <th className="th">{t('quantity')}</th>
                <th className="th">{t('requiredCerts')}</th>
                <th className="th">{t('quotesReceived')}</th>
                <th className="th">{t('due')}</th>
                <th className="th">Status</th>
              </tr>
            </thead>
            <tbody>
              {rfqs.map((r) => (
                <tr key={r.id} className="hover:bg-brand-pale" data-testid="rfq-row">
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
                  <td className="td text-xs text-muted">{r.requiredCerts || '—'}</td>
                  <td className="td font-bold">{r._count.quotes}</td>
                  <td className="td text-xs text-muted">{format.dateTime(r.requiredBy, { dateStyle: 'medium' })}</td>
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
  );
}
