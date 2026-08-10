import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/session';
import { can } from '@/lib/rbac';
import { groupsFor, parseSpec, specCompleteness } from '@/lib/product-spec';
import { segment, type ProductType } from '@/lib/taxonomy';
import { ProductEditor } from '@/components/product-editor';

/**
 * The full product editor.
 *
 * A separate page rather than a bigger modal. The curation template describes a
 * product across up to 90 columns, and `max-w-lg` at `max-h-[90vh]` cannot hold
 * them: a modal cannot be deep-linked, cannot be resumed, and loses everything
 * the seller typed when a validation error closes it. The quick-add modal on
 * the listing page stays exactly as it was — it creates a draft and sends the
 * seller here.
 */
export const dynamic = 'force-dynamic';

export default async function EditProductPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireRole(locale, ['seller', 'both']);
  const t = await getTranslations('products');

  const product = await prisma.product.findUnique({ where: { id } });
  // Org scoping before existence: a seller must not be able to probe which
  // product ids exist by watching for a different error.
  if (!product || product.orgId !== user.orgId) notFound();

  const type = product.productType as ProductType;
  const groups = groupsFor(type);
  const spec = parseSpec(product.specJson);
  const columns = product as unknown as Record<string, unknown>;
  const completeness = specCompleteness(type, columns, spec);

  const counts = Object.fromEntries(
    groups.map((g) => [
      g.id,
      {
        filled: g.fields.filter((f) => {
          const v = f.column ? columns[f.key] : spec[f.key];
          return v !== undefined && v !== null && v !== '';
        }).length,
        total: g.fields.length,
      },
    ]),
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <p className="mb-4 text-xs text-muted">
        <Link href="/seller/products" className="font-semibold text-brand hover:underline">
          {t('title')}
        </Link>{' '}
        › {product.name}
      </p>

      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">{product.name}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
            <span className="font-mono">CAS {product.cas}</span>
            <span className="rounded-pill bg-mist px-2 py-0.5 text-[11px] font-semibold text-slate2">
              {segment(type)?.label ?? type}
            </span>
          </p>
        </div>
        {/* The completeness meter is what makes a 250-column template tractable:
            a number a supplier can actually move, scoped to the fields their own
            segment needs rather than all of them. */}
        <div className="text-right" data-testid="spec-completeness">
          <p className="font-mono text-2xl font-bold text-brand">{completeness.pct}%</p>
          <p className="text-xs text-muted">
            {completeness.filled} / {completeness.total} {t('fieldsComplete')}
          </p>
        </div>
      </div>

      <ProductEditor
        product={{
          id: product.id,
          name: product.name,
          cas: product.cas,
          productType: type,
          facet: product.facet,
          grade: product.grade,
          purity: product.purity,
          moqKg: product.moqKg,
          leadTime: product.leadTime,
          priceMin: product.priceMin,
          priceMax: product.priceMax,
          shelfLife: product.shelfLife,
          storage: product.storage,
          incoterms: product.incoterms,
          packaging: product.packaging,
          stockStatus: product.stockStatus,
          sampleAvailable: product.sampleAvailable,
          status: product.status,
        }}
        groups={groups}
        values={Object.fromEntries(
          groups
            .flatMap((g) => g.fields)
            .map((f) => {
              const v = f.column ? columns[f.key] : spec[f.key];
              if (v === null || v === undefined) return [f.key, ''];
              if (typeof v === 'boolean') return [f.key, v ? 'yes' : 'no'];
              return [f.key, String(v)];
            }),
        )}
        counts={counts}
        canManage={can(user.principal, 'product:manage')}
      />
    </div>
  );
}
