import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { redirect } from '@/i18n/routing';
import { IntegrationsManager } from '@/components/integrations-manager';

export const dynamic = 'force-dynamic';

export default async function IntegrationsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale);
  const t = await getTranslations('integrations');

  // Staff have no org, so no keys to manage — send them to their account.
  if (!user.orgId) redirect({ href: '/account', locale });

  const [keys, hooks] = await Promise.all([
    prisma.apiKey.findMany({
      where: { orgId: user.orgId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, prefix: true, scopes: true, active: true, lastUsedAt: true },
    }),
    prisma.webhook.findMany({
      where: { orgId: user.orgId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, url: true, events: true, failCount: true },
    }),
  ]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">{t('title')}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">{t('subtitle')}</p>
        </div>
        <Link href="/developers" className="btn-ghost">{t('apiDocs')}</Link>
      </div>
      <IntegrationsManager
        keys={keys.map((k) => ({ ...k, lastUsedAt: k.lastUsedAt ? k.lastUsedAt.toISOString() : null }))}
        hooks={hooks}
      />
    </div>
  );
}
