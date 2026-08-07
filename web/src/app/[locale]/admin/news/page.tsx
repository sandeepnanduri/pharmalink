import { getTranslations, setRequestLocale } from 'next-intl/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { redirect } from '@/i18n/routing';
import { can, opsLanding } from '@/lib/rbac';
import { NewsAdmin } from '@/components/news-admin';

export const dynamic = 'force-dynamic';

/** News hub authoring — admin + product_admin publish market/regulatory posts. */
export default async function NewsAdminPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const actor = await requireUser(locale);
  if (!can(actor.principal, 'admin:moderate')) redirect({ href: opsLanding(actor.role), locale });

  const t = await getTranslations('news');

  const posts = await prisma.newsPost.findMany({
    orderBy: [{ createdAt: 'desc' }],
    take: 60,
    select: {
      id: true,
      title: true,
      summary: true,
      category: true,
      locale: true,
      status: true,
      publishedAt: true,
      createdAt: true,
    },
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-extrabold">{t('manage')}</h1>
      <p className="mb-6 mt-1 text-sm text-muted">{t('manageSub')}</p>
      <NewsAdmin
        posts={posts.map((p) => ({
          ...p,
          publishedAt: p.publishedAt ? p.publishedAt.toISOString() : null,
          createdAt: p.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
