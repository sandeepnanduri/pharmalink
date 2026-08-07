import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireUser } from '@/lib/session';
import { redirect } from '@/i18n/routing';
import { prisma } from '@/lib/db';
import { entitlements } from '@/lib/plans';
import { getOrgMembers, getSeatUsage, getMembership } from '@/lib/team-queries';
import { TeamManager } from '@/components/team-manager';

export const dynamic = 'force-dynamic';

/** Team accounts — an org owner adds/deactivates teammates within their seat plan. */
export default async function TeamPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale);
  const me = await getMembership(user.id);
  if (!me?.orgId) redirect({ href: '/account', locale }); // staff / no org

  const t = await getTranslations('team');
  const [members, seatsUsed, org] = await Promise.all([
    getOrgMembers(me!.orgId!),
    getSeatUsage(me!.orgId!),
    prisma.organization.findUnique({ where: { id: me!.orgId! }, select: { plan: true, name: true } }),
  ]);
  const seatsLimit = entitlements(org?.plan).seats;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-extrabold">{t('title')}</h1>
      <p className="mb-6 mt-1 text-sm text-muted">{t('subtitle', { org: org?.name ?? '' })}</p>
      <TeamManager
        members={members}
        seatsUsed={seatsUsed}
        seatsLimit={seatsLimit}
        isOwner={me!.orgRole === 'owner'}
        selfId={user.id}
      />
    </div>
  );
}
