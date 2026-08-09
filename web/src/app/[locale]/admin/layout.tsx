import { getTranslations, setRequestLocale } from 'next-intl/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { redirect } from '@/i18n/routing';
import { can, homeFor, isPlatformRole } from '@/lib/rbac';
import { signOut } from '@/auth';
import { OpsShell, type OpsNavGroup } from '@/components/ops-shell';

/**
 * The operations console.
 *
 * Until now `/admin/*` had no layout at all, so it rendered inside the
 * marketing navbar — which the redesign kit names as a bug, and which is
 * `sticky top-0 z-50` and therefore overlaps admin tables on scroll. The kit's
 * `app/index.html` is the design this implements.
 *
 * The gate lives here rather than being repeated in six pages: every ops route
 * requires a platform role. Each page still checks its own specific permission,
 * because `verifier` and `product_admin` are deliberately narrow — the person
 * clearing GMP certificates has no business moderating listings.
 */
export const dynamic = 'force-dynamic';

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale);
  if (!isPlatformRole(user.role)) redirect({ href: homeFor(user.role), locale });

  const t = await getTranslations('ops');

  // The one number worth carrying in the navigation: how many organisations are
  // waiting on a human. Anything else would be decoration.
  const pending = can(user.principal, 'admin:verify')
    ? await prisma.organization.count({ where: { status: 'pending' } })
    : 0;

  const groups: OpsNavGroup[] = [
    {
      label: t('groupOverview'),
      items: [
        ...(can(user.principal, 'admin:verify')
          ? [{ href: '/admin', label: t('verification'), icon: 'shield' as const, count: pending }]
          : []),
      ],
    },
    {
      label: t('groupMarketplace'),
      items: [
        ...(can(user.principal, 'admin:moderate')
          ? [
              { href: '/admin/products', label: t('catalogue'), icon: 'cube' as const },
              { href: '/admin/news', label: t('publishing'), icon: 'book' as const },
              { href: '/admin/market-data', label: t('marketData'), icon: 'chart' as const },
              { href: '/admin/imports', label: t('dataImport'), icon: 'upload' as const },
            ]
          : []),
      ],
    },
    {
      label: t('groupAdministration'),
      items: [...(can(user.principal, 'admin:users') ? [{ href: '/admin/users', label: t('users'), icon: 'users' as const }] : [])],
    },
  ].filter((g) => g.items.length > 0);

  return (
    <OpsShell
      groups={groups}
      user={{
        email: user.email,
        initial: ((user.name ?? user.email)[0] ?? '?').toUpperCase(),
        roleLabel: t(`role.${user.role}`),
      }}
      signOut={
        <form
          action={async () => {
            'use server';
            await signOut({ redirectTo: '/' });
          }}
        >
          <button type="submit" className="text-[11.5px] text-txt-inv2 transition hover:text-white">
            {t('signOut')}
          </button>
        </form>
      }
      consoleLabel={t('console')}
      searchPlaceholder={t('searchPlaceholder')}
    >
      {children}
    </OpsShell>
  );
}
