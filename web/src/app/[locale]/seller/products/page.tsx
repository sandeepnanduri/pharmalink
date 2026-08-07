import { getTranslations, setRequestLocale } from 'next-intl/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/session';
import { can } from '@/lib/rbac';
import { toggleProductStatusAction } from '@/lib/actions';
import { getDemandByCas } from '@/lib/product-queries';
import { VerificationBanner } from '@/components/verification-banner';
import { StatusBadge } from '@/components/status-badge';
import { ProductForm } from '@/components/product-form';
import { BulkImport } from '@/components/bulk-import';
import { TierEditor } from '@/components/tier-editor';

// Renders per-user data (session, org plan, quotas) — must never be served
// from the static/full route cache.
export const dynamic = 'force-dynamic';


export default async function SellerProductsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireRole(locale, ['seller', 'both']);
  const t = await getTranslations('products');

  const org = user.orgId
    ? await prisma.organization.findUnique({ where: { id: user.orgId }, select: { status: true, rejectedReason: true } })
    : null;

  const products = await prisma.product.findMany({
    where: { orgId: user.orgId ?? '' },
    orderBy: { createdAt: 'desc' },
    include: { priceTiers: { orderBy: { minQtyKg: 'asc' } } },
  });
  const demand = await getDemandByCas(products.map((p) => p.cas));

  const allowed = can(user.principal, 'product:manage');

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">{t('title')}</h1>
          <p className="mt-1 text-sm text-muted">{t('subtitle')}</p>
        </div>
        {allowed && (
          <div className="flex flex-wrap items-center gap-2">
            {/* A file download from an API route, not a page navigation. */}
            <a href="/api/seller/products/export" className="btn-ghost" data-testid="export-products" download>⬇ {t('exportCsv')}</a>
            <ProductForm label={t('add')} />
          </div>
        )}
      </div>

      {allowed && <div className="mb-6"><BulkImport /></div>}

      <VerificationBanner status={org?.status as never} role={user.role} reason={org?.rejectedReason} />

      {products.length === 0 ? (
        <div className="card py-12 text-center text-sm text-muted" data-testid="no-products">
          {t('noProducts')}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-card border border-line bg-white">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">{t('name')}</th>
                <th className="th">CAS</th>
                <th className="th">Grade</th>
                <th className="th">MOQ</th>
                <th className="th">{t('priceRange')}</th>
                <th className="th">{t('demand')}</th>
                <th className="th">{t('tiers')}</th>
                <th className="th">{t('status')}</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} data-testid="product-row">
                  <td className="td font-bold">{p.name}</td>
                  <td className="td font-mono text-xs text-muted">{p.cas}</td>
                  <td className="td">{p.grade ?? '—'}</td>
                  <td className="td">{p.moqKg} kg</td>
                  <td className="td font-mono text-xs">
                    {p.priceMin != null ? `$${p.priceMin}–${p.priceMax}` : '—'}
                  </td>
                  <td className="td" data-testid={`demand-${p.id}`}>
                    {demand[p.cas] ? <span className="badge-info">{t('rfqMatches', { n: demand[p.cas] })}</span> : <span className="text-xs text-muted">—</span>}
                  </td>
                  <td className="td">
                    {allowed ? <TierEditor productId={p.id} tiers={p.priceTiers.map((tr) => ({ minQtyKg: tr.minQtyKg, pricePerKg: tr.pricePerKg }))} /> : p.priceTiers.length}
                  </td>
                  <td className="td">
                    <StatusBadge status={p.status} />
                  </td>
                  <td className="td">
                    {allowed && (
                      <form action={toggleProductStatusAction}>
                        <input type="hidden" name="id" value={p.id} />
                        <button type="submit" className="text-xs font-semibold text-brand hover:underline" data-testid={`toggle-${p.id}`}>
                          {p.status === 'live' ? t('unpublish') : t('publish')}
                        </button>
                      </form>
                    )}
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
