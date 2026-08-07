import type { Metadata } from 'next';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { getPublishedContent } from '@/lib/content-queries';
import { contentHref, isExternal } from '@/lib/content';
import { absoluteUrl, localeAlternates } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'content' });
  return {
    title: t('indexTitle'),
    description: t('indexSub'),
    alternates: { canonical: absoluteUrl(locale, '/content'), languages: localeAlternates('/content') },
  };
}

export default async function ContentIndexPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('content');
  const format = await getFormatter();
  const items = await getPublishedContent(locale);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-extrabold">{t('indexTitle')}</h1>
      <p className="mt-2 text-sm text-muted">{t('indexSub')}</p>

      {items.length === 0 ? (
        <div className="card mt-8 py-12 text-center text-sm text-muted" data-testid="content-empty">{t('empty')}</div>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((it) => {
            const external = isExternal(it);
            const href = contentHref(it);
            const inner = (
              <>
                {it.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.imageUrl} alt="" className="mb-3 h-36 w-full rounded-lg object-cover" />
                )}
                <div className="flex items-center gap-2 text-[11px] text-muted">
                  <span className="chip">{t(`cat_${it.category}`)}</span>
                  {external ? (
                    <span>{it.sourceName ?? t('kindLink')} ↗</span>
                  ) : (
                    it.publishedAt && <time dateTime={it.publishedAt.toISOString()}>{format.dateTime(it.publishedAt, { dateStyle: 'medium' })}</time>
                  )}
                </div>
                <h2 className="mt-1.5 text-base font-bold leading-snug">{it.title}</h2>
                {it.summary && <p className="mt-1 line-clamp-3 text-xs text-muted">{it.summary}</p>}
              </>
            );
            return external ? (
              <a key={it.id} href={href} target="_blank" rel="noopener noreferrer nofollow" className="card block transition hover:-translate-y-0.5 hover:shadow-lift" data-testid="content-card">
                {inner}
              </a>
            ) : (
              <Link key={it.id} href={href} className="card block transition hover:-translate-y-0.5 hover:shadow-lift" data-testid="content-card">
                {inner}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
