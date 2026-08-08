import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { Link, redirect } from '@/i18n/routing';
import { prisma } from '@/lib/db';
import { currentUser } from '@/lib/session';
import { landingFor } from '@/lib/rbac';
import { getMarketActivity, getLatestListings, getLatestNews } from '@/lib/activity';
import { getFeaturedContent } from '@/lib/content-queries';
import { getSupplierRatings } from '@/lib/social-queries';
import { Stars } from '@/components/stars';
import { MarketingHero } from '@/components/marketing-hero';
import { MarketplaceSection, VerifySection } from '@/components/marketing/sections';
import { Reveal } from '@/components/marketing/reveal';
import '../marketing.css';
import { contentHref, isExternal } from '@/lib/content';
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
  const tContent = await getTranslations('content');
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

  // Ops-curated "Spotlight" content (CMS) — authored articles + crawled links.
  const spotlight = await getFeaturedContent(locale, 6);
  // Real buyer ratings for the featured suppliers (averages, never fabricated).
  const supplierRatings = await getSupplierRatings(suppliers.map((s) => s.id));

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
  const activityIcon: Record<string, string> = { listing: '📦', verified: '✅', rfq: '📝', deal: '🤝' };

  const categories = [
    { key: 'api', icon: '💊', title: tc('api'), desc: tc('apiDesc') },
    { key: 'intermediate', icon: '⚗️', title: tc('intermediate'), desc: tc('intermediateDesc') },
    { key: 'ksm', icon: '🧪', title: tc('ksm'), desc: tc('ksmDesc') },
    { key: 'excipient', icon: '🧫', title: tc('excipient'), desc: tc('excipientDesc') },
  ];

  const steps = [
    { n: 1, title: t('step1Title'), body: t('step1Body') },
    { n: 2, title: t('step2Title'), body: t('step2Body') },
    { n: 3, title: t('step3Title'), body: t('step3Body') },
    { n: 4, title: t('step4Title'), body: t('step4Body') },
    { n: 5, title: t('step5Title'), body: t('step5Body') },
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

      {/* .mk carries the design's tokens; its own sections use the design's
          `.wrap` for width. The not-yet-ported sections below keep the app
          container they were written against, so this is a seam, not a
          regression — it moves down the page as more sections are ported. */}
      <div className="mk">
        <Reveal />
        <MarketplaceSection t={t} />
        <VerifySection t={t} />
      </div>

      <div className="mx-auto max-w-7xl px-4 pb-8 sm:px-6">
      {/* The design's two statement bands, in its own markup and classes
          (src/app/marketing.css, scoped under .mk). They replace the old
          capabilities grid, which said the same things in a weaker form. */}
      {/* Spotlight — ops-curated CMS content (articles + crawled links) */}
      {spotlight.length > 0 && (
        <section className="mt-12" data-testid="spotlight">
          <div className="mb-3 flex items-baseline justify-between">
            <div>
              <h2 className="text-lg font-bold">{t('spotlight')}</h2>
              <p className="text-xs text-muted">{t('spotlightSub')}</p>
            </div>
            <Link href="/content" className="text-xs font-semibold text-brand hover:underline">
              {t('viewAll')}
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {spotlight.map((it) => {
              const external = isExternal(it);
              const href = contentHref(it);
              const inner = (
                <>
                  {it.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.imageUrl} alt="" className="mb-3 h-36 w-full rounded-lg object-cover" />
                  )}
                  <div className="flex items-center gap-2 text-[11px] text-muted">
                    <span className="chip">{tContent(`cat_${it.category}`)}</span>
                    {external && <span className="truncate">{it.sourceName ?? ''} ↗</span>}
                  </div>
                  <h3 className="mt-1.5 text-[15px] font-bold leading-snug">{it.title}</h3>
                  {it.summary && <p className="mt-1 line-clamp-2 text-xs text-muted">{it.summary}</p>}
                </>
              );
              return external ? (
                <a key={it.id} href={href} target="_blank" rel="noopener noreferrer nofollow" className="card block transition hover:-translate-y-0.5 hover:border-brand hover:shadow-lift" data-testid="spotlight-card">
                  {inner}
                </a>
              ) : (
                <Link key={it.id} href={href} className="card block transition hover:-translate-y-0.5 hover:border-brand hover:shadow-lift" data-testid="spotlight-card">
                  {inner}
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Live market activity + Pharma news — real records only, buyers anonymised */}
      <div className="mt-10 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section data-testid="market-activity">
          <div className="mb-3 flex items-baseline justify-between">
            <div>
              <h2 className="text-lg font-bold">{t('marketActivity')}</h2>
              <p className="text-xs text-muted">{t('marketActivitySub')}</p>
            </div>
          </div>
          {activity.length === 0 ? (
            <div className="card py-8 text-center text-sm text-muted">{t('noActivity')}</div>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-white">
              {activity.map((a) => {
                const line = activityLine(a);
                const inner = (
                  <div className="flex items-start gap-3 px-4 py-3">
                    <span className="mt-0.5 text-base" aria-hidden>
                      {activityIcon[a.kind]}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-snug">
                        <span className="font-semibold">{line.who}</span>{' '}
                        <span className="text-muted">{line.verb}</span>{' '}
                        <span className="font-semibold">{line.what}</span>
                      </p>
                      {line.meta && <p className="mt-0.5 text-xs text-muted">{line.meta}</p>}
                    </div>
                    <time className="shrink-0 text-[11px] text-muted" dateTime={a.at.toISOString()}>
                      {format.relativeTime(a.at)}
                    </time>
                  </div>
                );
                return (
                  <li key={a.id} data-testid="activity-row">
                    {line.href ? (
                      <Link href={line.href} className="block transition hover:bg-surface">
                        {inner}
                      </Link>
                    ) : (
                      inner
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section data-testid="pharma-news">
          <div className="mb-3 flex items-baseline justify-between">
            <div>
              <h2 className="text-lg font-bold">{t('pharmaNews')}</h2>
              <p className="text-xs text-muted">{t('pharmaNewsSub')}</p>
            </div>
            <Link href="/news" className="text-xs font-semibold text-brand hover:underline">
              {t('viewAll')}
            </Link>
          </div>
          {news.length === 0 ? (
            <div className="card py-8 text-center text-sm text-muted">{t('noNews')}</div>
          ) : (
            <ul className="space-y-3">
              {news.map((n) => (
                <li key={n.id}>
                  <Link
                    href={`/news/${n.id}`}
                    className="card block transition hover:-translate-y-0.5 hover:shadow-lift"
                    data-testid="news-card"
                  >
                    <div className="flex items-center gap-2 text-[11px] text-muted">
                      <span className="chip">{n.category}</span>
                      <time dateTime={(n.publishedAt ?? n.createdAt).toISOString()}>
                        {format.dateTime(n.publishedAt ?? n.createdAt, { dateStyle: 'medium' })}
                      </time>
                    </div>
                    <h3 className="mt-1.5 text-sm font-bold leading-snug">{n.title}</h3>
                    <p className="mt-1 line-clamp-2 text-xs text-muted">{n.summary}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Latest listings — newest live products from verified suppliers */}
      <div className="mb-3 mt-10 flex items-baseline justify-between">
        <div>
          <h2 className="text-lg font-bold">{t('latestListings')}</h2>
          <p className="text-xs text-muted">{t('latestListingsSub')}</p>
        </div>
        <Link href="/catalog" className="text-xs font-semibold text-brand hover:underline">
          {t('viewAll')}
        </Link>
      </div>
      {listings.length === 0 ? (
        <div className="card py-8 text-center text-sm text-muted">{t('noListings')}</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {listings.map((p) => (
            <Link
              key={p.id}
              href={`/products/${p.id}`}
              className="card transition hover:-translate-y-0.5 hover:border-brand hover:shadow-lift"
              data-testid="listing-card"
            >
              <div className="flex items-center gap-2">
                <span className="chip">{p.category}</span>
                <span className="font-mono text-[11px] text-muted">CAS {p.cas}</span>
              </div>
              <h3 className="mt-2 text-sm font-bold leading-snug">{p.name}</h3>
              <p className="mt-1 text-xs text-muted">
                {p.org.name} · {p.org.city}, {p.org.country}
              </p>
            </Link>
          ))}
        </div>
      )}

      {/* Categories */}
      <h2 className="mb-3 mt-10 text-lg font-bold">{t('categories')}</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {categories.map((c) => (
          <Link
            key={c.key}
            href={{ pathname: '/catalog', query: { category: c.key } }}
            className="card transition hover:-translate-y-0.5 hover:border-brand hover:shadow-lift"
          >
            <div className="text-2xl">{c.icon}</div>
            <h3 className="mt-2 text-[15px] font-bold">{c.title}</h3>
            <p className="mt-1 text-xs text-muted">{c.desc}</p>
          </Link>
        ))}
      </div>

      {/* How it works */}
      <section className="card mt-8">
        <h2 className="mb-4 text-base font-bold">{t('howItWorks')}</h2>
        <ol className="grid gap-5 sm:grid-cols-3 lg:grid-cols-5">
          {steps.map((s) => (
            <li key={s.n} className="text-center">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-brand-pale font-display text-lg font-extrabold text-brand">
                {s.n}
              </div>
              <h3 className="mt-2.5 text-[13px] font-bold">{s.title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Featured suppliers — real rows from the database */}
      <div className="mb-3 mt-10 flex items-baseline justify-between">
        <h2 className="text-lg font-bold">{t('featured')}</h2>
        <span className="text-xs text-muted" data-testid="live-product-count">
          {productCount}
        </span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {suppliers.map((s) => (
          <Link key={s.id} href={`/suppliers/${s.id}`} className="card transition hover:-translate-y-0.5 hover:shadow-lift">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-pale to-brand-mid font-display text-sm font-extrabold text-brand">
                {s.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">{s.name}</p>
                <p className="mt-0.5 text-xs text-muted">
                  {s.city}, {s.country} · {s._count.products}
                </p>
                <div className="mt-0.5">
                  <Stars average={supplierRatings[s.id]?.average ?? 0} count={supplierRatings[s.id]?.count ?? 0} />
                </div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <span className="badge-verified">✓</span>
              {s.certifications.map((c) => (
                <span key={c.name} className="chip">
                  {c.name}
                </span>
              ))}
            </div>
          </Link>
        ))}
      </div>
      </div>
    </>
  );
}
