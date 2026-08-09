import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { LocaleSwitcher } from './locale-switcher';
import { Logo } from './logo';
import { MobileNav } from './mobile-nav';

/**
 * Public navigation.
 *
 * Visitors only. Everyone signed in gets the console shell instead — see
 * `SignedInShell` — so the role branches that used to live here are gone, and
 * with them the second sticky navbar the redesign kit reported. Navigation for
 * signed-in roles is modelled once, in `src/lib/app-nav.ts`.
 */
function publicNav(t: (k: string) => string) {
  return [
    { href: '/catalog', label: t('marketplace') },
    { href: '/pricing', label: t('pricing') },
    { href: '/verify', label: t('verify') },
    { href: '/developers', label: t('developers') },
  ];
}

/** Rendered for signed-out visitors only; `SignedInShell` decides. */
export async function SiteHeader() {
  const t = await getTranslations('nav');
  const items = publicNav(t);

  return (
    // Ink, not the `#2D2B55` indigo this carried from the pre-redesign palette
    // — an ad-hoc hex is exactly what tailwind.config.ts forbids, and it left
    // the chrome half a design behind the tokens.
    <header className="sticky top-0 z-50 border-b border-white/10 bg-ink">
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
          <Link href="/login" className="whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[13px] font-semibold text-white/70 hover:bg-white/10 hover:text-white sm:px-3">
            {t('login')}
          </Link>
          <Link href="/signup" className="whitespace-nowrap rounded-lg bg-brand-gradient px-2.5 py-1.5 text-[13px] font-semibold text-ink hover:opacity-90 sm:px-3">
            {t('signup')}
          </Link>
        </div>
      </div>
    </header>
  );
}
