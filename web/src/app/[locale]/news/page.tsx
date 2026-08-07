import type { Metadata } from 'next';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { prisma } from '@/lib/db';
import { absoluteUrl, localeAlternates } from '@/lib/seo';

// News is authored and published by ops — reflect changes without a rebuild.
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'news' });
  const path = '/news';
  return {
    title: t('title'),
    description: t('subtitle'),
    alternates: { canonical: absoluteUrl(locale, path), languages: localeAlternates(path) },
  };
}

export default async function NewsListPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('news');
  const format = await getFormatter();

  const posts = await prisma.newsPost.findMany({
    where: { status: 'published', locale, publishedAt: { not: null } },
    orderBy: { publishedAt: 'desc' },
    take: 40,
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-extrabold">{t('title')}</h1>
      <p className="mt-2 text-sm text-muted">{t('subtitle')}</p>

      {posts.length === 0 ? (
        <div className="card mt-8 py-12 text-center text-sm text-muted" data-testid="news-empty">
          {t('empty')}
        </div>
      ) : (
        <ul className="mt-8 space-y-4">
          {posts.map((n) => (
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
                <h2 className="mt-1.5 text-lg font-bold leading-snug">{n.title}</h2>
                <p className="mt-1 text-sm text-muted">{n.summary}</p>
                <span className="mt-2 inline-block text-xs font-semibold text-brand">{t('readMore')} →</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
