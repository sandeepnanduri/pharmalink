import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { prisma } from '@/lib/db';
import { currentUser } from '@/lib/session';
import { canBuy } from '@/lib/rbac';
import { getOwnSampleRequest } from '@/lib/sample-queries';
import { RequestSample } from '@/components/request-sample';
import { absoluteUrl, localeAlternates, jsonLd, SITE_NAME } from '@/lib/seo';

async function loadProduct(id: string) {
  return prisma.product.findUnique({
    where: { id },
    include: {
      org: {
        select: {
          id: true, name: true, city: true, country: true, status: true, verifiedAt: true,
          certifications: { where: { status: 'verified' }, select: { name: true, expiresAt: true } },
        },
      },
      priceTiers: { orderBy: { minQtyKg: 'asc' } },
    },
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale, id } = await params;
  const product = await loadProduct(id);
  if (product?.status !== 'live') return { title: 'Not found', robots: { index: false } };

  // Search-optimised, specific title/description built from real attributes —
  // this is what ranks a product page for "<name> CAS <n> supplier".
  const title = `${product.name} (CAS ${product.cas}) — ${product.org.name}`;
  const description = `${product.name}, CAS ${product.cas}${product.grade ? `, ${product.grade}` : ''}${
    product.purity ? `, purity ${product.purity}` : ''
  }. Supplied by ${product.org.name}, a GMP-verified supplier in ${product.org.city}, ${product.org.country}. Request a quote on ${SITE_NAME}.`;
  const path = `/products/${id}`;

  return {
    title,
    description,
    alternates: { canonical: absoluteUrl(locale, path), languages: localeAlternates(path) },
    openGraph: { title, description, url: absoluteUrl(locale, path), type: 'website' },
  };
}

export default async function ProductPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('product');
  const tc = await getTranslations('catalog');
  const ts = await getTranslations('supplier');
  const format = await getFormatter();

  const product = await loadProduct(id);
  if (product?.status !== 'live') notFound();

  const user = await currentUser();
  const ownSample = product.sampleAvailable ? await getOwnSampleRequest(user?.orgId, product.id) : null;
  const facts = [
    [t('pharmacopeia'), product.grade ?? '—'],
    [tc('purity'), product.purity ?? '—'],
    [tc('moq'), `${product.moqKg} kg`],
    [tc('leadTime'), product.leadTime ?? '—'],
    [t('shelfLife'), product.shelfLife ?? '—'],
    [t('storage'), product.storage ?? '—'],
    ...(product.formula ? [[t('formula'), product.formula]] : []),
    ...(product.dmfNumber ? [[t('dmf'), product.dmfNumber]] : []),
    [t('sample'), product.sampleAvailable ? t('sampleYes') : t('sampleNo')],
  ];

  // Product structured data — lets Google show a rich result (name, brand,
  // supplier) for this CAS instead of a plain blue link.
  const ld = jsonLd({
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    category: product.category,
    ...(product.priceMin != null && {
      offers: {
        '@type': 'AggregateOffer',
        priceCurrency: 'USD',
        lowPrice: product.priceMin,
        highPrice: product.priceMax ?? product.priceMin,
        offerCount: 1,
        seller: { '@type': 'Organization', name: product.org.name },
      },
    }),
    additionalProperty: [
      { '@type': 'PropertyValue', name: 'CAS Number', value: product.cas },
      ...(product.grade ? [{ '@type': 'PropertyValue', name: 'Pharmacopeia grade', value: product.grade }] : []),
      ...(product.purity ? [{ '@type': 'PropertyValue', name: 'Purity', value: product.purity }] : []),
    ],
    brand: { '@type': 'Organization', name: product.org.name },
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ld }} />
      <p className="mb-4 text-xs text-muted">
        <Link href="/catalog" className="font-semibold text-brand hover:underline">
          {tc('title')}
        </Link>{' '}
        › {product.name}
      </p>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="card">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-extrabold">{product.name}</h1>
                <span className="badge-neutral">{product.category}</span>
              </div>
              <p className="mt-1.5 font-mono text-sm text-muted">CAS {product.cas}</p>
            </div>
            {product.priceMin != null && (
              <p className="font-mono text-lg font-bold text-brand">
                ${product.priceMin}–{product.priceMax}/kg
              </p>
            )}
          </div>

          <div className="my-5 h-px bg-line" />

          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {facts.map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-muted">{k}</dt>
                <dd className="mt-0.5 text-sm font-semibold">{v}</dd>
              </div>
            ))}
          </dl>

          {product.priceTiers.length > 0 && (
            <>
              <div className="my-5 h-px bg-line" />
              <h2 className="mb-2 text-sm font-bold">{t('volumePricing')}</h2>
              <table className="w-full max-w-sm text-sm" data-testid="volume-tiers">
                <thead>
                  <tr>
                    <th className="th">{t('fromQty')}</th>
                    <th className="th">{t('pricePerKg')}</th>
                  </tr>
                </thead>
                <tbody>
                  {product.priceTiers.map((tr) => (
                    <tr key={tr.id}>
                      <td className="td">{tr.minQtyKg.toLocaleString()} kg+</td>
                      <td className="td font-mono font-bold text-brand">${tr.pricePerKg}/kg</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <div className="my-5 h-px bg-line" />

          <h2 className="mb-2 text-sm font-bold">{t('compliance')}</h2>
          <div className="flex flex-wrap gap-2">
            {product.org.certifications.map((c) => (
              <span key={c.name} className="chip">
                🛡️ {c.name}
                {c.expiresAt && (
                  <span className="font-normal text-muted">
                    {ts('expires', { date: format.dateTime(c.expiresAt, { year: 'numeric', month: 'short' }) })}
                  </span>
                )}
              </span>
            ))}
          </div>

          <p className="mt-4 rounded-lg border border-brand-mid bg-brand-pale px-3 py-2.5 text-xs text-indigo-900">
            🔒 {t('docsGated')}
          </p>
        </div>

        <aside className="card h-fit">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-pale to-brand-mid font-display text-sm font-extrabold text-brand">
              {product.org.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{product.org.name}</p>
              <p className="text-xs text-muted">
                {product.org.city}, {product.org.country}
              </p>
            </div>
          </div>

          <p className="mt-3">
            <span className="badge-verified">✓ {ts('verified')}</span>
          </p>

          <div className="my-4 h-px bg-line" />

          {/* Carry the product through, so the RFQ wizard opens pre-filled with
              what the buyer just clicked instead of asking them to retype it.
              Signed out, the intent survives the login round-trip (F1.6). */}
          {user ? (
            <Link
              href={{ pathname: '/buyer/rfqs/new', query: { productId: product.id } }}
              className="btn-primary w-full"
              data-testid="request-quote"
            >
              {tc('requestQuote')}
            </Link>
          ) : (
            <Link
              href={{ pathname: '/login', query: { next: `/buyer/rfqs/new?productId=${product.id}` } }}
              className="btn-primary w-full"
              data-testid="request-quote"
            >
              {tc('requestQuote')}
            </Link>
          )}
          <Link href={`/suppliers/${product.org.id}`} className="btn-ghost mt-2 w-full">
            {t('viewSupplier')}
          </Link>

          {product.sampleAvailable && user && canBuy(user.role) && (
            <div className="mt-3">
              <RequestSample productId={product.id} existingStatus={ownSample?.status ?? null} />
            </div>
          )}

          {!user && (
            <p className="mt-3 rounded-lg border border-amber-300 bg-warn-pale px-3 py-2 text-xs text-amber-900">
              🔑 {t('signInToContact')}
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
