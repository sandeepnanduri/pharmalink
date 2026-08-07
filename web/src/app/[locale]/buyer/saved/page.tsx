import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { requireRole } from '@/lib/session';
import { getSavedSuppliers } from '@/lib/social-queries';
import { saveSupplierAction } from '@/lib/social-actions';
import { Stars } from '@/components/stars';
import { AddToCompareButton } from '@/components/compare-tray';

export const dynamic = 'force-dynamic';

/** A buyer's shortlisted suppliers, ready to compare or quote. */
export default async function SavedSuppliersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireRole(locale, ['buyer', 'both']);
  const t = await getTranslations('saved');

  const saved = user.orgId ? await getSavedSuppliers(user.orgId) : [];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-extrabold">{t('title')}</h1>
      <p className="mb-6 mt-1 text-sm text-muted">{t('subtitle')}</p>

      {saved.length === 0 ? (
        <div className="card py-12 text-center text-sm text-muted" data-testid="no-saved">
          {t('empty')}{' '}
          <Link href="/catalog" className="font-semibold text-brand hover:underline">
            {t('browse')}
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {saved.map((s) => (
            <div key={s.id} className="card" data-testid="saved-row">
              <Link href={`/suppliers/${s.supplierOrg.id}`} className="block">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-pale to-brand-mid font-display text-sm font-extrabold text-brand">
                    {s.supplierOrg.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{s.supplierOrg.name}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {s.supplierOrg.city}, {s.supplierOrg.country} · {s.supplierOrg._count.products} {t('products')}
                    </p>
                    <div className="mt-1">
                      <Stars average={s.rating.average} count={s.rating.count} />
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {s.supplierOrg.certifications.map((c) => (
                    <span key={c.name} className="chip text-[11px]">{c.name}</span>
                  ))}
                </div>
              </Link>
              <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
                <AddToCompareButton id={s.supplierOrg.id} />
                <form action={saveSupplierAction} className="ml-auto">
                  <input type="hidden" name="supplierOrgId" value={s.supplierOrg.id} />
                  <button type="submit" className="text-xs font-semibold text-red-700 hover:underline" data-testid={`unsave-${s.supplierOrg.id}`}>
                    {t('remove')}
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
