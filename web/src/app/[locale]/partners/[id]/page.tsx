import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { CompanyLogo } from '@/components/company-logo';
import { getPartnerPublicProfile } from '@/lib/partner-queries';
import { TIER_BADGE_CLASS } from '@/lib/partner';
import { absoluteUrl, localeAlternates, jsonLd, SITE_NAME } from '@/lib/seo';

export async function generateMetadata({ params }: { params: Promise<{ locale: string; id: string }> }): Promise<Metadata> {
  const { locale, id } = await params;
  const profile = await getPartnerPublicProfile(id);
  if (!profile) return { title: 'Not found', robots: { index: false } };

  const title = `${profile.partner.org.name} — Verified Sourcing Partner, ${profile.partner.org.country}`;
  const description = `${profile.partner.org.name}: a ${SITE_NAME}-verified sourcing partner in ${profile.partner.org.city ?? profile.partner.org.country}. ${profile.mandatesCompleted} mandates completed.`;
  const path = `/partners/${id}`;

  return {
    title,
    description,
    alternates: { canonical: absoluteUrl(locale, path), languages: localeAlternates(path) },
    openGraph: { title, description, url: absoluteUrl(locale, path), type: 'profile' },
  };
}

export default async function PartnerProfilePage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('partnerProfile');
  const format = await getFormatter();

  const profile = await getPartnerPublicProfile(id);
  if (!profile) notFound();
  const { partner, representedCount, mandatesCompleted } = profile;
  const categories = (partner.org.sourcingCategories ?? '').split(',').filter(Boolean);

  const ld = jsonLd({
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: partner.org.name,
    address: { '@type': 'PostalAddress', addressLocality: partner.org.city ?? undefined, addressCountry: partner.org.country },
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ld }} />

      <div className="card flex flex-wrap items-start gap-5 p-7">
        <CompanyLogo name={partner.org.name} size={72} className="!rounded-2xl" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-extrabold">{partner.org.name}</h1>
            <span className={TIER_BADGE_CLASS}>{t(`tier_${partner.tier}`)}</span>
          </div>
          <p className="mt-1 text-sm text-muted">
            {t(`archetype_${partner.archetype}`)} · {partner.org.city ? `${partner.org.city}, ` : ''}
            {partner.org.country}
          </p>
          {categories.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {categories.map((c) => (
                <span key={c} className="chip">
                  {c}
                </span>
              ))}
            </div>
          )}
        </div>
        <a href={`mailto:?subject=${encodeURIComponent(t('hireSubject', { name: partner.org.name }))}`} className="btn-primary shrink-0">
          {t('hireCta')}
        </a>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <div className="card">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{t('orgsRepresented')}</p>
          <p className="mt-1.5 font-display text-3xl font-extrabold tabular-nums">{representedCount}</p>
          <p className="mt-1 text-[11px] text-muted">{t('countOnly')}</p>
        </div>
        <div className="card">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{t('mandatesCompleted')}</p>
          <p className="mt-1.5 font-display text-3xl font-extrabold tabular-nums">{mandatesCompleted}</p>
        </div>
        <div className="card">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{t('partnerSince')}</p>
          <p className="mt-1.5 font-display text-3xl font-extrabold tabular-nums">
            {partner.org.verifiedAt ? format.dateTime(partner.org.verifiedAt, { year: 'numeric' }) : '—'}
          </p>
        </div>
      </div>

      {partner.org.about && (
        <div className="card mt-5">
          <h2 className="mb-2 text-base font-bold">{t('aboutTitle')}</h2>
          <p className="text-sm leading-relaxed text-slate2">{partner.org.about}</p>
        </div>
      )}
    </div>
  );
}
