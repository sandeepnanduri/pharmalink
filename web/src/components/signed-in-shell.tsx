import { getTranslations } from 'next-intl/server';
import { signOut } from '@/auth';
import { currentUser } from '@/lib/session';
import { prisma } from '@/lib/db';
import { can, isPlatformRole, canBuy, canSell } from '@/lib/rbac';
import { consoleKey, navGroups } from '@/lib/app-nav';
import { AppShell } from '@/components/app-shell';
import { SiteHeader } from '@/components/site-header';
import { CompareBar } from '@/components/compare-tray';
import { NotificationBell } from '@/components/notification-bell';
import { LocaleSwitcher } from '@/components/locale-switcher';

/**
 * Picks the chrome for the current visitor.
 *
 *   signed out → the marketing header, unchanged
 *   signed in  → the console shell from the redesign kit
 *
 * One decision point, made on the server, so there is no flash of the wrong
 * chrome and no client-side branch to keep in sync. The compare tray is a
 * buyer affordance and rides along only for people who can buy.
 */
export async function SignedInShell({ children }: { children: React.ReactNode }) {
  const user = await currentUser();

  if (!user) {
    return (
      <>
        <SiteHeader />
        <main>{children}</main>
        <CompareBar />
      </>
    );
  }

  const t = await getTranslations('nav');
  const staff = isPlatformRole(user.role);

  // The one count worth carrying in navigation. Anything else is decoration,
  // and this query only runs for the role that can act on it.
  const pendingVerifications = can(user.principal, 'admin:verify')
    ? await prisma.organization.count({ where: { status: 'pending' } })
    : undefined;

  const groups = navGroups({ role: user.role, principal: user.principal, pendingVerifications });
  const name = user.name ?? user.email;

  // Search goes to the list this role actually searches: staff moderate the
  // catalogue, buyers browse it, and a supplier searches their own listings.
  const searchHref = staff ? '/en/admin/products' : canSell(user.role) && !canBuy(user.role) ? '/en/seller/products' : '/en/catalog';

  return (
    <>
      <AppShell
        groups={groups}
        user={{
          email: user.email,
          initial: (name[0] ?? '?').toUpperCase(),
          roleLabel: t(`role_${user.role}`),
        }}
        badge={t(`badge_${staff ? 'ops' : canSell(user.role) && !canBuy(user.role) ? 'supplier' : 'buyer'}`)}
        consoleLabel={t(consoleKey(user.role))}
        searchHref={searchHref}
        searchPlaceholder={t(staff ? 'searchOps' : 'searchCatalog')}
        searchLabel={t('searchLabel')}
        bell={<NotificationBell />}
        localeSwitcher={<LocaleSwitcher />}
        signOut={
          <form
            action={async () => {
              'use server';
              await signOut({ redirectTo: '/' });
            }}
          >
            <button type="submit" className="text-[11.5px] text-txt-inv2 transition hover:text-white">
              {t('logout')}
            </button>
          </form>
        }
      >
        {children}
      </AppShell>
      {canBuy(user.role) && <CompareBar />}
    </>
  );
}
