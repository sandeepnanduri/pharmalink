import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { prisma } from '@/lib/db';
import { currentUser } from '@/lib/session';
import { canReviewSupplier } from '@/lib/reviews';
import { getSupplierRating, getSupplierReviews, getOwnReview, isSaved } from '@/lib/social-queries';
import { saveSupplierAction } from '@/lib/social-actions';
import { Stars } from '@/components/stars';
import { CompanyLogo } from '@/components/company-logo';
import { getSupplierExtras } from '@/lib/supplier-queries';
import { CommercialPanel, PerformancePanel, RegulatoryPanel } from '@/components/supplier-panels';
import { ReviewForm } from '@/components/review-form';
import { AddToCompareButton } from '@/components/compare-tray';
import { absoluteUrl, localeAlternates, jsonLd, SITE_NAME } from '@/lib/seo';

function loadSupplier(id: string) {
  return prisma.organization.findUnique({
    where: { id },
    include: {
      certifications: { where: { status: 'verified' } },
      sites: true,
      products: { where: { status: 'live' } },
    },
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale, id } = await params;
  const org = await loadSupplier(id);
  if (org?.status !== 'verified') return { title: 'Not found', robots: { index: false } };

  const certs = org.certifications.map((c) => c.name).join(', ');
  const title = `${org.name} — GMP-verified API supplier, ${org.country}`;
  const description = `${org.name}: a ${SITE_NAME}-verified pharmaceutical ingredient supplier in ${org.city ?? org.country}, ${
    org.country
  }. ${org.products.length} products${certs ? ` · ${certs}` : ''}. View certifications and request a quote.`;
  const path = `/suppliers/${id}`;

  return {
    title,
    description,
    alternates: { canonical: absoluteUrl(locale, path), languages: localeAlternates(path) },
    openGraph: { title, description, url: absoluteUrl(locale, path), type: 'profile' },
  };
}

export default async function SupplierPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('supplier');
  const extras = await getSupplierExtras(id);
  const tc = await getTranslations('catalog');
  const format = await getFormatter();

  const tr = await getTranslations('reviews');
  const org = await loadSupplier(id);
  if (org?.status !== 'verified') notFound();

  const user = await currentUser();
  const viewerOrg = user?.orgId
    ? await prisma.organization.findUnique({ where: { id: user.orgId }, select: { kind: true, status: true } })
    : null;
  const [rating, reviews, ownReview, saved] = await Promise.all([
    getSupplierRating(id),
    getSupplierReviews(id),
    getOwnReview(user?.orgId, id),
    isSaved(user?.orgId, id),
  ]);
  const eligibleToReview =
    viewerOrg?.status === 'verified' &&
    canReviewSupplier({ authorOrgId: user?.orgId, authorKind: viewerOrg?.kind, supplierOrgId: id });

  // Organization structured data — surfaces the verified supplier as an entity.
  const ld = jsonLd({
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: org.name,
    ...(org.website && { url: org.website }),
    address: { '@type': 'PostalAddress', addressLocality: org.city ?? undefined, addressCountry: org.country },
    ...(org.about && { description: org.about }),
    knowsAbout: org.certifications.map((c) => c.name),
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ld }} />
      <div className="card">
        <div className="flex flex-wrap items-start gap-4">
          {/* Real logo where one resolves, deterministic monogram where it does
              not — see components/company-logo.tsx for why it is never hotlinked. */}
          <CompanyLogo name={org.name} website={org.website} logoUrl={org.logoUrl} size={64} className="!rounded-2xl" />
          <div className="min-w-[200px] flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-extrabold">{org.name}</h1>
              <span className="badge-verified">✓ {t('verified')}</span>
            </div>
            <p className="mt-1 text-sm text-muted">
              {org.city}, {org.country}
              {org.exportMarkets && ` · ${t('markets')}: ${org.exportMarkets}`}
            </p>
            <div className="mt-1.5">
              <Stars average={rating.average} count={rating.count} size="lg" />
            </div>
            {org.verifiedAt && (
              <p className="mt-1 text-xs text-muted">
                {t('verifiedSince', { date: format.dateTime(org.verifiedAt, { dateStyle: 'medium' }) })}
              </p>
            )}
            <div className="mt-3 flex gap-6">
              <div>
                <p className="text-xs text-muted">{t('products')}</p>
                <p className="text-base font-bold">{org.products.length}</p>
              </div>
              <div>
                <p className="text-xs text-muted">{t('sites')}</p>
                <p className="text-base font-bold">{org.sites.length}</p>
              </div>
            </div>
          </div>
        </div>
        {org.about && <p className="mt-4 border-t border-line pt-4 text-sm leading-relaxed text-slate2">{org.about}</p>}
        <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
          {eligibleToReview && (
            <form action={saveSupplierAction}>
              <input type="hidden" name="supplierOrgId" value={org.id} />
              <button
                type="submit"
                className={`btn-ghost !py-1.5 text-xs ${saved ? '!border-brand !text-brand' : ''}`}
                data-testid="save-supplier"
              >
                {saved ? `♥ ${tr('saved')}` : `♡ ${tr('save')}`}
              </button>
            </form>
          )}
          <AddToCompareButton id={org.id} />
          <Link href={`/suppliers/${org.id}#reviews`} className="btn-ghost !py-1.5 text-xs">
            ★ {tr('reviews')} ({rating.count})
          </Link>
        </div>
      </div>

      {/* Regulatory verdict sits ABOVE certificates: a current import alert makes
          the certificate list irrelevant, so it must not appear below it. */}
      <div className="mt-8">
        <RegulatoryPanel regulatory={extras.regulatory} />
      </div>

      <div className="mt-8">
        <PerformancePanel performance={extras.performance} />
      </div>

      <div className="mt-8">
        <CommercialPanel commercial={extras.commercial} />
      </div>

      <h2 className="mb-3 mt-8 text-base font-bold">{t('certifications')}</h2>
      <div className="card overflow-x-auto p-0">
        {org.certifications.length === 0 ? (
          <p className="p-6 text-sm text-muted">{t('noCerts')}</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">{t('certifications')}</th>
                <th className="th">Status</th>
                <th className="th">Expiry</th>
                <th className="th">Source</th>
              </tr>
            </thead>
            <tbody>
              {org.certifications.map((c) => (
                <tr key={c.id}>
                  <td className="td font-semibold">{c.name}</td>
                  <td className="td">
                    <span className="badge-verified">✓</span>
                  </td>
                  <td className="td font-mono text-xs">
                    {c.expiresAt ? format.dateTime(c.expiresAt, { year: 'numeric', month: 'short' }) : '—'}
                  </td>
                  <td className="td text-xs text-muted">{c.verifiedVia ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <h2 className="mb-3 mt-8 text-base font-bold">{t('products')}</h2>
      <ul className="space-y-3">
        {org.products.map((p) => (
          <li key={p.id}>
            <Link href={`/products/${p.id}`} className="card flex items-center gap-4 transition hover:border-brand-mid">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-100">💊</div>
              <div className="flex-1">
                <p className="text-sm font-bold">{p.name}</p>
                <p className="font-mono text-xs text-muted">
                  CAS {p.cas} · {p.grade} · {tc('moq')} {p.moqKg} kg
                </p>
              </div>
              {p.priceMin != null && (
                <p className="font-mono text-sm font-bold text-brand">
                  ${p.priceMin}–{p.priceMax}/kg
                </p>
              )}
            </Link>
          </li>
        ))}
      </ul>

      {/* Ratings & reviews — real buyer feedback only */}
      <h2 id="reviews" className="mb-3 mt-10 flex items-center gap-3 text-base font-bold">
        {tr('reviews')}
        <span className="font-normal">
          <Stars average={rating.average} count={rating.count} />
        </span>
      </h2>

      {eligibleToReview && (
        <div className="mb-4">
          <ReviewForm
            supplierOrgId={org.id}
            existing={ownReview ? { rating: ownReview.rating, title: ownReview.title, body: ownReview.body, tags: ownReview.tags } : null}
          />
        </div>
      )}

      {reviews.length === 0 ? (
        <div className="card py-8 text-center text-sm text-muted" data-testid="no-reviews">
          {tr('noReviews')}
        </div>
      ) : (
        <ul className="space-y-3">
          {reviews.map((r) => (
            <li key={r.id} className="card" data-testid="review-row">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-amber-500" aria-label={`${r.rating} stars`}>
                  {'★'.repeat(r.rating)}
                  <span className="text-slate-300">{'★'.repeat(5 - r.rating)}</span>
                </span>
                <span className="text-sm font-bold">{r.authorOrg.name}</span>
                <span className="text-xs text-muted">· {r.authorOrg.country}</span>
                {r.verifiedBuyer && <span className="badge-verified text-[10px]">✓ {tr('verifiedBuyer')}</span>}
                <time className="ml-auto text-xs text-muted" dateTime={r.createdAt.toISOString()}>
                  {format.dateTime(r.createdAt, { dateStyle: 'medium' })}
                </time>
              </div>
              {r.title && <p className="mt-2 text-sm font-semibold">{r.title}</p>}
              {r.body && <p className="mt-1 text-sm leading-relaxed text-slate2">{r.body}</p>}
              {r.tags && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {r.tags.split(',').filter(Boolean).map((tag) => (
                    <span key={tag} className="chip text-[11px]">{tag}</span>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
