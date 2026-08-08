import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/routing';
import { prisma } from '@/lib/db';
import { currentUser } from '@/lib/session';
import { landingFor } from '@/lib/rbac';
import { getMarketActivity, getLatestListings, getLatestNews } from '@/lib/activity';
import { MarketingHero } from '@/components/marketing-hero';
import { MarketplaceSection, VerifySection } from '@/components/marketing/sections';
import { Reveal } from '@/components/marketing/reveal';
import { Ticker, Stats, TrackSection, FeaturesSection, HowSection, ListingsSection, SuppliersSection, NewsSection, CtaSection, MarketingFooter } from '@/components/marketing/rest';
import '../marketing.css';
import { monogram, monogramHue } from '@/lib/logo';

import { SITE_URL, SITE_NAME, absoluteUrl, jsonLd } from '@/lib/seo';

/**
 * The public marketing page. Dynamic because it must know whether you are signed
 * in (and its supplier/product counts should be live, not frozen at build time).
 */
export const dynamic = 'force-dynamic';

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  // A signed-in user has a job to do — send them to it. Showing an existing
  // supplier a "Get started free" hero is noise at best, confusing at worst.
  const user = await currentUser();
  if (user) redirect({ href: landingFor(user), locale });

  const t = await getTranslations('home');
  const tc = await getTranslations('category');
  const format = await getFormatter();

  // The hero pill states a supplier and a country count. The mockup carries
  // "2,300+ suppliers · 48 countries"; those are not our numbers, and a trust
  // platform that opens with an invented figure has lost the argument on its
  // own terms. These are counted from the verified rows we actually hold.
  const [supplierTotal, countries] = await Promise.all([
    prisma.organization.count({ where: { status: 'verified', kind: { in: ['seller', 'both'] } } }),
    prisma.organization.findMany({
      where: { status: 'verified', kind: { in: ['seller', 'both'] }, country: { not: '' } },
      select: { country: true },
      distinct: ['country'],
    }),
  ]);
  const countryTotal = countries.length;

  const [suppliers, productCount, activity, listings, news] = await Promise.all([
    prisma.organization.findMany({
      where: { status: 'verified', kind: { in: ['seller', 'both'] } },
      select: {
        id: true,
        name: true,
        city: true,
        country: true,
        certifications: { where: { status: 'verified' }, select: { name: true }, take: 2 },
        _count: { select: { products: true } },
      },
      take: 4,
    }),
    prisma.product.count({ where: { status: 'live' } }),
    getMarketActivity(7),
    getLatestListings(6),
    getLatestNews(locale, 4),
  ]);

  // Human, localised phrasing for each activity kind. The buyer is NEVER named:
  // rfq/deal rows read "A buyer …" so no competitor can profile a named pharma.
  const activityLine = (a: (typeof activity)[number]) => {
    switch (a.kind) {
      case 'listing':
        return { who: a.actor!, verb: t('actListing'), what: a.subject, meta: a.detail, href: a.href };
      case 'verified':
        return { who: a.actor!, verb: t('actVerified'), what: a.subject, href: a.href };
      case 'rfq':
        return { who: t('anonBuyer'), verb: t('actRfq'), what: a.subject, meta: a.detail };
      case 'deal':
        return { who: t('anonBuyer'), verb: t('actDeal'), what: a.subject };
    }
  };
  // Only these four segments have translated labels; anything else shows as API.
  const CATEGORY_KEYS = new Set(['api', 'intermediate', 'ksm', 'excipient']);

  // ---- View models for the design's sections, built from real rows --------
  // The mockup ships sample listings, suppliers and news. Those are the points
  // its own README calls out as needing a real API call, so they read the
  // database; the design supplies the frame, not the facts.
  // The avatar hue is derived from the company name so the same supplier is the
  // same colour everywhere — the monogram helper already does this for logos.
  const avatarHue = (name: string) => `hsl(${monogramHue(name)} 62% 32%)`;

  const listingCards = listings.map((p) => ({
    id: p.id,
    name: p.name,
    cas: p.cas,
    segmentKey: CATEGORY_KEYS.has(p.productType) ? p.productType : 'api',
    segment: tc(CATEGORY_KEYS.has(p.productType) ? p.productType : 'api'),
    supplier: p.org.name,
    place: [p.org.city, p.org.country].filter(Boolean).join(', '),
    initial: monogram(p.org.name).slice(0, 1),
    hue: avatarHue(p.org.name),
    // The mockup prints a price here. We do not publish one: unit price is what
    // a supplier quotes against a specific RFQ, and printing a public number
    // would anchor every negotiation on the platform. MOQ is a listed fact.
    moq: p.moqKg ? t('lsMoq', { n: format.number(p.moqKg) }) : t('lsMoqNone'),
  }));

  const supplierCards = suppliers.map((s) => ({
    id: s.id,
    name: s.name,
    place: [s.city, s.country].filter(Boolean).join(', '),
    initial: monogram(s.name).slice(0, 1),
    hue: `linear-gradient(135deg, hsl(${monogramHue(s.name)} 62% 44%), hsl(${monogramHue(s.name)} 62% 30%))`,
    certs: s.certifications.map((c) => c.name),
    products: s._count.products,
  }));

  const newsCards = news.map((n) => ({
    id: n.id,
    title: n.title,
    source: SITE_NAME,
    tint: '#0A8F7C',
    // Formatted on the server: toLocaleString in a client component renders the
    // server's timezone first and the browser's second, which is a hydration error.
    date: n.publishedAt ? format.dateTime(n.publishedAt, { dateStyle: 'medium' }) : '',
    href: `/news/${n.id}`,
  }));

  // The ticker mirrors the same live activity feed the old page listed, so it is
  // real events — and buyers stay anonymous here exactly as they do there.
  const TICKER_DOT: Record<string, string> = { listing: '#0FBFA4', verified: '#41B7F0', rfq: '#8B7CF6', deal: '#F2B33D' };
  const tickerItems = activity.slice(0, 6).map((a) => {
    const line = activityLine(a)!;
    return { dot: TICKER_DOT[a.kind] ?? '#0FBFA4', text: `${line.who} ${line.verb}`, strong: line.what };
  });

  // Counted, not claimed. The mockup's 2,300+/12,400+/26h/98% are illustrative;
  // these are the rows this deployment actually holds, and the two that cannot
  // be derived from data are stated as the platform's commitment rather than as
  // a measured figure.
  const statCards = [
    { value: `${format.number(supplierTotal)}`, label: t('statSuppliers', { countries: countryTotal }) },
    { value: `${format.number(productCount)}`, label: t('statListings') },
    { value: t('statQuoteValue'), label: t('statQuote') },
    { value: t('statTrailValue'), label: t('statTrail') },
  ];

  // Organization + WebSite with a search action — tells Google the site name,
  // logo, and that the catalog is searchable (can yield a sitelinks searchbox).
  const ld = jsonLd({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        name: SITE_NAME,
        url: SITE_URL,
        logo: `${SITE_URL}/icon.svg`,
        description: t('heroBody'),
      },
      {
        '@type': 'WebSite',
        name: SITE_NAME,
        url: SITE_URL,
        potentialAction: {
          '@type': 'SearchAction',
          target: { '@type': 'EntryPoint', urlTemplate: `${absoluteUrl(locale, '/catalog')}?q={search_term_string}` },
          'query-input': 'required name=search_term_string',
        },
      },
    ],
  });

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ld }} />
      {/* The dark hero is full-bleed: it sits OUTSIDE the page's max-width
          wrapper. Inside it, the ink ground stops at 1280px and the marketing
          band reads as a panel rather than as the top of the page. */}
      <MarketingHero t={t} locale={locale} supplierCount={format.number(supplierTotal)} countryCount={String(countryTotal)} />

      {/* The design's running order, in its own markup and classes. `.mk` carries
          its tokens; each section uses the design's own `.wrap` for width. */}
      <div className="mk">
        <Reveal />
        <Ticker items={tickerItems} />
        <Stats stats={statCards} />
        <MarketplaceSection t={t} />
        <VerifySection t={t} />
        <TrackSection t={t} />
        <FeaturesSection t={t} />
        <ListingsSection t={t} listings={listingCards} />
        <HowSection t={t} />
        <SuppliersSection t={t} suppliers={supplierCards} />
        <NewsSection t={t} news={newsCards} />
        <CtaSection t={t} />
        <MarketingFooter t={t} />
      </div>
    </>
  );
}
