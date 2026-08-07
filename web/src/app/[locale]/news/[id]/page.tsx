import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { prisma } from '@/lib/db';
import { absoluteUrl } from '@/lib/seo';

export const dynamic = 'force-dynamic';

async function getPost(id: string) {
  return prisma.newsPost.findFirst({ where: { id, status: 'published' } });
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string; id: string }> }): Promise<Metadata> {
  const { locale, id } = await params;
  const post = await getPost(id);
  if (!post) return {};
  return {
    title: post.title,
    description: post.summary,
    alternates: { canonical: absoluteUrl(locale, `/news/${id}`) },
    openGraph: { title: post.title, description: post.summary, type: 'article' },
  };
}

export default async function NewsDetailPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('news');
  const format = await getFormatter();

  const post = await getPost(id);
  if (!post) notFound();

  return (
    <article className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <Link href="/news" className="text-xs font-semibold text-brand hover:underline">
        ← {t('back')}
      </Link>

      <div className="mt-4 flex items-center gap-2 text-[11px] text-muted">
        <span className="chip">{post.category}</span>
        <time dateTime={(post.publishedAt ?? post.createdAt).toISOString()}>
          {format.dateTime(post.publishedAt ?? post.createdAt, { dateStyle: 'long' })}
        </time>
      </div>

      <h1 className="mt-2 text-3xl font-extrabold leading-tight">{post.title}</h1>
      <p className="mt-3 text-lg leading-relaxed text-slate2">{post.summary}</p>

      {post.body && (
        <div className="prose-news mt-6 space-y-4 text-[15px] leading-relaxed text-ink">
          {post.body.split(/\n{2,}/).map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>
      )}

      {post.sourceUrl && /^https?:\/\//i.test(post.sourceUrl) && (
        <p className="mt-8 border-t border-line pt-4 text-sm">
          {t('source')}:{' '}
          <a href={post.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="font-semibold text-brand hover:underline">
            {post.sourceUrl}
          </a>
        </p>
      )}
    </article>
  );
}
