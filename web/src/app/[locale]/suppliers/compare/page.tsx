import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { getSuppliersForCompare } from '@/lib/social-queries';
import { Stars } from '@/components/stars';

export const dynamic = 'force-dynamic';

/** Side-by-side supplier comparison built from real profile data (no AI verdict). */
export default async function CompareSuppliersPage({
  searchParams,
  params,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ ids?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('compare');

  const ids = (await searchParams).ids?.split(',').filter(Boolean).slice(0, 4) ?? [];
  const suppliers = ids.length ? await getSuppliersForCompare(ids) : [];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-extrabold">{t('title')}</h1>
      <p className="mb-6 mt-1 text-sm text-muted">{t('subtitle')}</p>

      {suppliers.length < 2 ? (
        <div className="card py-12 text-center text-sm text-muted" data-testid="compare-empty">
          {t('needTwo')}{' '}
          <Link href="/catalog" className="font-semibold text-brand hover:underline">
            {t('browse')}
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-card border border-line bg-white">
          <table className="w-full min-w-[640px]" data-testid="compare-table">
            <thead>
              <tr>
                <th className="th w-40">{t('criteria')}</th>
                {suppliers.map((s) => (
                  <th key={s.id} className="th">
                    <Link href={`/suppliers/${s.id}`} className="font-bold text-brand hover:underline">
                      {s.name}
                    </Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { label: t('rating'), render: (s: (typeof suppliers)[number]) => <Stars average={s.rating.average} count={s.rating.count} /> },
                { label: t('location'), render: (s: (typeof suppliers)[number]) => `${s.city ? s.city + ', ' : ''}${s.country}` },
                { label: t('products'), render: (s: (typeof suppliers)[number]) => `${s._count.products}` },
                { label: t('sites'), render: (s: (typeof suppliers)[number]) => `${s._count.sites}` },
                {
                  label: t('certifications'),
                  render: (s: (typeof suppliers)[number]) =>
                    s.certifications.length ? (
                      <div className="flex flex-wrap gap-1">
                        {s.certifications.map((c) => (
                          <span key={c.name} className="chip text-[11px]">{c.name}</span>
                        ))}
                      </div>
                    ) : (
                      '—'
                    ),
                },
                { label: t('markets'), render: (s: (typeof suppliers)[number]) => s.exportMarkets || '—' },
                { label: t('dmf'), render: (s: (typeof suppliers)[number]) => s.dmfNumbers || '—' },
                { label: t('incoterm'), render: (s: (typeof suppliers)[number]) => s.defaultIncoterm || '—' },
                { label: t('payment'), render: (s: (typeof suppliers)[number]) => s.defaultPaymentTerms || '—' },
                { label: t('leadTime'), render: (s: (typeof suppliers)[number]) => s.defaultLeadTime || '—' },
              ].map((row) => (
                <tr key={row.label}>
                  <td className="td font-semibold text-slate2">{row.label}</td>
                  {suppliers.map((s) => (
                    <td key={s.id} className="td text-sm">{row.render(s)}</td>
                  ))}
                </tr>
              ))}
              <tr>
                <td className="td" />
                {suppliers.map((s) => (
                  <td key={s.id} className="td">
                    <Link href={`/suppliers/${s.id}`} className="btn-primary !px-3 !py-1.5 text-xs">
                      {t('view')}
                    </Link>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
