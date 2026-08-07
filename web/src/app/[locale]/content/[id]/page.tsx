import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { getPublicContentItem } from '@/lib/content-queries';
import { absoluteUrl } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string; id: string }> }): Promise<Metadata> {
  const { locale, id } = await params;
  const item = await getPublicContentItem(id);
  if (!item) return {};
  return {
    title: item.title,
    description: item.summary ?? undefined,
    alternates: { canonical: absoluteUrl(locale, `/content/${id}`) },
    openGraph: {
      title: item.title,
      description: item.summary ?? undefined,
      type: 'article',
      images: item.imageUrl ? [item.imageUrl] : undefined,
    },
  };
}

/** Public detail page for a CMS article (kind="link" items open off-site instead). */
export default async function ContentDetailPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('content');
  const format = await getFormatter();

  const item = await getPublicContentItem(id);
  if (!item) notFound();

  return (
    <article className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <Link href="/content" className="text-xs font-semibold text-brand hover:underline">
        ← {t('backToAll')}
      </Link>

      <div className="mt-4 flex items-center gap-2 text-[11px] text-muted">
        <span className="chip">{t(`cat_${item.category}`)}</span>
        {item.publishedAt && (
          <time dateTime={item.publishedAt.toISOString()}>{format.dateTime(item.publishedAt, { dateStyle: 'long' })}</time>
        )}
      </div>

      <h1 className="mt-2 text-3xl font-extrabold leading-tight">{item.title}</h1>
      {item.summary && <p className="mt-3 text-lg leading-relaxed text-slate2">{item.summary}</p>}

      {item.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.imageUrl} alt="" className="mt-6 w-full rounded-card border border-line object-cover" />
      )}

      {item.body && (
        <div className="mt-6 space-y-4 text-[15px] leading-relaxed text-ink">
          {item.body.split(/\n{2,}/).map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>
      )}

      {item.sourceUrl && (
        <p className="mt-8 border-t border-line pt-4 text-sm">
          {t('source')}:{' '}
          <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="font-semibold text-brand hover:underline">
            {item.sourceName ?? item.sourceUrl}
          </a>
        </p>
      )}
    </article>
  );
}
