import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireUser } from '@/lib/session';
import { redirect } from '@/i18n/routing';
import { can, opsLanding } from '@/lib/rbac';
import { getAllContent } from '@/lib/content-queries';
import { ContentManager } from '@/components/content-manager';

export const dynamic = 'force-dynamic';

/** CMS — admin + product_admin author articles, crawl links, and curate the homepage. */
export default async function ContentAdminPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const actor = await requireUser(locale);
  if (!can(actor.principal, 'admin:moderate')) redirect({ href: opsLanding(actor.role), locale });

  const t = await getTranslations('content');
  const items = await getAllContent();

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-extrabold">{t('manage')}</h1>
      <p className="mb-6 mt-1 text-sm text-muted">{t('manageSub')}</p>
      <ContentManager
        items={items.map((i) => ({
          id: i.id,
          kind: i.kind,
          locale: i.locale,
          title: i.title,
          summary: i.summary,
          body: i.body,
          imageUrl: i.imageUrl,
          sourceUrl: i.sourceUrl,
          sourceName: i.sourceName,
          canonicalUrl: i.canonicalUrl,
          category: i.category,
          tags: i.tags,
          status: i.status,
          featured: i.featured,
          sortOrder: i.sortOrder,
        }))}
      />
    </div>
  );
}
