import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { signOut } from '@/auth';
import { currentUser } from '@/lib/session';
import { LocaleSwitcher } from './locale-switcher';
import { NotificationBell } from './notification-bell';
import { Logo } from './logo';
import { MobileNav } from './mobile-nav';
import { canBuy, canSell, isPlatformRole, opsLanding, type Role } from '@/lib/rbac';

/**
 * Role-aware primary navigation.
 *
 * Each role sees only its own work. Browsing the marketplace is a BUYER
 * activity: a supplier's job is their listings and the inquiries against them,
 * so surfacing a catalog browser to them is noise.
 */
function navFor(role: Role | null, t: (k: string) => string) {
  const items: { href: string; label: string }[] = [];
  if (!role) {
    items.push({ href: '/catalog', label: t('marketplace') });
    items.push({ href: '/pricing', label: t('pricing') });
    items.push({ href: '/verify', label: t('verify') });
    items.push({ href: '/developers', label: t('developers') });
    return items;
  }
  if (isPlatformRole(role)) {
    // Staff work inside the ops console, which carries its own role-filtered
    // sidebar (src/components/ops-shell.tsx) and hides this header entirely.
    // Duplicating six ops links here only created a second, stickier navbar to
    // keep in sync — and it was the source of the overlap-on-scroll the
    // redesign kit reported. What remains is the way back into the console from
    // the two pages that sit outside it.
    items.push({ href: opsLanding(role), label: t('opsConsole') });
    items.push({ href: '/account', label: t('account') });
    return items;
  }
  if (canBuy(role)) {
    // Buyers source, so the catalog is core to their job.
    items.push({ href: '/catalog', label: t('marketplace') });
    items.push({ href: '/buyer', label: t('dashboard') });
    items.push({ href: '/buyer/rfqs', label: t('rfqs') });
    items.push({ href: '/buyer/saved', label: t('saved') });
  }
  if (canSell(role)) {
    items.push({ href: '/seller', label: canBuy(role) ? t('inquiries') : t('dashboard') });
    items.push({ href: '/seller/products', label: t('products') });
    items.push({ href: '/seller/facilities', label: t('facilities') });
    items.push({ href: '/seller/filings', label: t('filings') });
  }
  items.push({ href: '/orders', label: t('orders') });
  items.push({ href: '/compliance', label: t('compliance') });
  items.push({ href: '/analytics', label: t('analytics') });
  // Own-account surfaces — every trading org manages its own profile and plan.
  items.push({ href: '/account', label: t('account') });
  items.push({ href: '/billing', label: t('billing') });
  return items;
}

export async function SiteHeader() {
  const t = await getTranslations('nav');
  // Shares the per-request cached lookup with the page guard and the bell —
  // one auth pass per render, not three.
  const user = await currentUser();
  const items = navFor(user?.role ?? null, t);

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-gradient-to-r from-brand-deep to-[#2D2B55]">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-3 sm:gap-4 sm:px-6">
        <Logo />

        <MobileNav items={items} />

        <nav className="hidden items-center gap-1 md:flex">
          {items.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-white/70 transition hover:bg-white/10 hover:text-white"
            >
              {i.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
          <LocaleSwitcher />
          {user ? (
            <>
              <NotificationBell />
              <span className="hidden max-w-[180px] truncate text-xs text-white/60 lg:inline" data-testid="current-user">
                {user.email}
              </span>
              <form
                action={async () => {
                  'use server';
                  await signOut({ redirectTo: '/' });
                }}
              >
                <button type="submit" className="whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[13px] font-semibold text-white/70 hover:bg-white/10 hover:text-white sm:px-3">
                  {t('logout')}
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className="whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[13px] font-semibold text-white/70 hover:bg-white/10 hover:text-white sm:px-3">
                {t('login')}
              </Link>
              <Link href="/signup" className="whitespace-nowrap rounded-lg bg-brand px-2.5 py-1.5 text-[13px] font-semibold text-white hover:bg-brand-light sm:px-3">
                {t('signup')}
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
