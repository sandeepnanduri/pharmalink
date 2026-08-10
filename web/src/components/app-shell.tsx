'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import type { NavGroup, NavIcon } from '@/lib/app-nav';

/**
 * The signed-in application shell — dark rail, light content.
 *
 * Ported from `app/index.html` in the redesign kit, and applied to **every**
 * signed-in user rather than only to staff. The kit's rules, which this
 * follows: the hexagon is the brand motif for icon containers and avatars
 * (never a circle or a rounded square), JetBrains Mono carries every
 * identifying number, teal means verified, and the console is dark chrome with
 * a light content area — never a fully dark data table.
 *
 * Applying it beyond ops is a deliberate call. The marketing header was a
 * second, stickier navbar that the kit named as a bug, and it still carried a
 * hardcoded `#2D2B55` from the pre-teal palette — so signed-in users were
 * looking at half the old design. One shell means one place where navigation,
 * breadcrumb and identity live, and the marketing chrome is now only ever seen
 * by visitors.
 */

/**
 * Inline 16px stroke icons. Inline rather than a sprite or an icon package:
 * there are a dozen, and the CSP forbids external fetches anyway.
 */
const ICONS: Record<NavIcon, React.ReactNode> = {
  dashboard: (
    <>
      <rect x="3" y="3" width="8" height="8" rx="2" />
      <rect x="13" y="3" width="8" height="5" rx="2" />
      <rect x="13" y="10" width="8" height="11" rx="2" />
      <rect x="3" y="13" width="8" height="8" rx="2" />
    </>
  ),
  shield: (
    <>
      <path d="M12 2l7 4v6c0 5-3 8-7 10-4-2-7-5-7-10V6l7-4z" />
      <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  cube: (
    <>
      <path d="M12 2l8 5v10l-8 5-8-5V7l8-5z" strokeLinejoin="round" />
      <path d="M12 12l8-5M12 12v10M12 12L4 7" />
    </>
  ),
  book: <path d="M4 19V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14l-4-2-4 2-4-2-4 2z" strokeLinejoin="round" />,
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c1.2-3.2 3.6-5 6.5-5s5.3 1.8 6.5 5" strokeLinecap="round" />
      <circle cx="17.5" cy="9" r="2.5" />
      <path d="M16.5 15.2c2.4.3 4.1 1.7 5 4" strokeLinecap="round" />
    </>
  ),
  chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" strokeLinecap="round" />,
  upload: (
    <>
      <path d="M12 16V4M8 8l4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" strokeLinecap="round" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
    </>
  ),
  rfq: (
    <>
      <path d="M6 2h8l4 4v16H6z" strokeLinejoin="round" />
      <path d="M14 2v4h4M9 12h6M9 16h6" strokeLinecap="round" />
    </>
  ),
  orders: (
    <>
      <path d="M3 7l9-4 9 4v10l-9 4-9-4z" strokeLinejoin="round" />
      <path d="M3 7l9 4 9-4M12 11v10" />
    </>
  ),
  bookmark: <path d="M6 3h12v18l-6-4-6 4z" strokeLinejoin="round" />,
  factory: (
    <>
      <path d="M3 21V10l6 4V10l6 4V7l6 3v11z" strokeLinejoin="round" />
      <path d="M3 21h18" strokeLinecap="round" />
    </>
  ),
  account: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.6-4 4.4-6 8-6s6.4 2 8 6" strokeLinecap="round" />
    </>
  ),
  billing: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
    </>
  ),
};

function Icon({ name }: { name: NavIcon }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
      className="shrink-0 opacity-75"
    >
      {ICONS[name]}
    </svg>
  );
}

/** Locale prefix stripped, so `/en/seller/products` compares as `/seller/products`. */
function useAppPath() {
  const pathname = usePathname() ?? '';
  return pathname.replace(/^\/[a-z]{2}(?=\/|$)/, '') || '/';
}

/**
 * Exact match for a section root, prefix match below it. Without the special
 * case, `/seller` would light up on `/seller/products` as well as its own page.
 */
function isActive(href: string, path: string): boolean {
  const roots = ['/admin', '/seller', '/buyer', '/account'];
  return roots.includes(href) ? path === href : path === href || path.startsWith(`${href}/`);
}

export interface ShellUser {
  email: string;
  initial: string;
  roleLabel: string;
}

function NavLink({ item, onNavigate }: { item: NavGroup['items'][number]; onNavigate?: () => void }) {
  const t = useTranslations('nav');
  const path = useAppPath();
  const active = isActive(item.href, path);

  return (
    <Link
      href={item.href}
      // Every sidebar link is on screen at all times, so the default eager
      // prefetch renders the whole console on every page view: seven full
      // server renders, against one SQLite connection, for pages nobody has
      // asked for. It also starves the page you ARE on -- a `router.refresh()`
      // after an action queues behind the prefetches, and the screen keeps
      // showing pre-action state until they drain.
      prefetch={false}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      data-testid={`nav-${item.href.replace(/\W+/g, '-').replace(/^-|-$/g, '') || 'root'}`}
      className={`relative flex items-center gap-3 rounded-control px-2.5 py-2.5 text-[13.5px] font-medium transition ${
        active
          ? 'bg-gradient-to-r from-teal/[0.16] to-teal/[0.05] text-white before:absolute before:-left-3.5 before:bottom-[20%] before:top-[20%] before:w-[3px] before:rounded-r-[3px] before:bg-teal before:content-[""]'
          : 'text-txt-inv2 hover:bg-white/5 hover:text-white'
      }`}
    >
      <Icon name={item.icon} />
      <span className="truncate">{t(item.labelKey)}</span>
      {item.count ? (
        <span className="ml-auto rounded-pill bg-teal px-1.5 py-0.5 font-mono text-[10.5px] font-bold text-ink">{item.count}</span>
      ) : null}
    </Link>
  );
}

function Sidebar({
  groups,
  user,
  badge,
  signOut,
  onNavigate,
}: {
  groups: NavGroup[];
  user: ShellUser;
  badge: string;
  signOut: React.ReactNode;
  onNavigate?: () => void;
}) {
  const t = useTranslations('nav');
  return (
    <div className="flex h-full flex-col bg-ink text-txt-inv2">
      <Link href="/" className="flex items-center gap-2.5 px-5 pb-4 pt-5 font-display text-[17px] font-bold text-white">
        {/* The hexagon is the benzene ring — the brand mark, not decoration. */}
        <span className="hex grid h-8 w-7 place-items-center bg-brand-gradient text-[13px]">◆</span>
        <span>
          Pharma<em className="not-italic text-teal">Link</em>
        </span>
        <span className="ml-auto rounded-md border border-teal/40 px-1.5 py-0.5 font-mono text-[9.5px] font-extrabold uppercase tracking-widest text-teal-bright">
          {badge}
        </span>
      </Link>

      <nav className="flex-1 overflow-y-auto pb-4">
        {groups.map((group) => (
          <div key={group.labelKey} className="px-3.5 pb-1 pt-3.5">
            <div className="mb-1.5 px-2.5 text-[10px] font-bold uppercase tracking-[1.8px] text-txt-inv2/70">{t(group.labelKey)}</div>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavLink key={item.href} item={item} onNavigate={onNavigate} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="mt-auto flex items-center gap-2.5 border-t border-line-dark p-4">
        <span className="hex grid h-9 w-8 place-items-center bg-gradient-to-br from-violet to-violet-deep text-[13px] font-bold text-white">
          {user.initial}
        </span>
        <div className="min-w-0 flex-1">
          {/* The account, not a friendly name: every action here lands in the
              audit log, so which account you are acting as is what matters. */}
          <div className="truncate text-[12px] font-semibold text-txt-inv" data-testid="current-user" title={user.email}>
            {user.email}
          </div>
          <div className="text-[10.5px] text-txt-inv2">{user.roleLabel}</div>
        </div>
        {signOut}
      </div>
    </div>
  );
}

export function AppShell({
  groups,
  user,
  badge,
  consoleLabel,
  searchHref,
  searchPlaceholder,
  searchLabel,
  signOut,
  bell,
  localeSwitcher,
  children,
}: {
  groups: NavGroup[];
  user: ShellUser;
  /** The short tag beside the wordmark: OPS, BUYER, SUPPLIER. */
  badge: string;
  consoleLabel: string;
  /** Where the global search posts — the list this role actually searches. */
  searchHref: string;
  searchPlaceholder: string;
  /** Short accessible name; see the note at the input. */
  searchLabel: string;
  signOut: React.ReactNode;
  bell: React.ReactNode;
  localeSwitcher: React.ReactNode;
  children: React.ReactNode;
}) {
  const t = useTranslations('nav');
  const [drawer, setDrawer] = useState(false);
  const path = useAppPath();
  const current = groups.flatMap((g) => g.items).find((i) => isActive(i.href, path));

  return (
    // `grid-cols-1` at the base breakpoint is load-bearing, not tidiness: with
    // only the `lg` template defined, the single implicit track below `lg` is
    // sized `auto`, i.e. to max-content, so a wide table pushed the whole
    // document past the viewport instead of scrolling inside its own container.
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[248px_1fr]" data-testid="app-shell">
      {/* The column carries the ink background and the rail inside it is
          sticky, so a page taller than the viewport scrolls under a rail that
          stays put rather than leaving a pale strip where the rail ends. */}
      <div className="hidden bg-ink lg:block">
        <aside className="sticky top-0 h-screen">
          <Sidebar groups={groups} user={user} badge={badge} signOut={signOut} />
        </aside>
      </div>

      {/* Below `lg` the 248px rail is most of a phone, so it becomes a drawer. */}
      {drawer && (
        <>
          <button type="button" aria-label={t('menu')} className="fixed inset-0 z-40 bg-ink/60 lg:hidden" onClick={() => setDrawer(false)} />
          <div className="fixed inset-y-0 left-0 z-50 w-64 lg:hidden">
            <Sidebar groups={groups} user={user} badge={badge} signOut={signOut} onNavigate={() => setDrawer(false)} />
          </div>
        </>
      )}

      <main className="flex min-w-0 flex-col bg-mist">
        <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-white px-4 py-3 sm:gap-4 sm:px-6">
          <button
            type="button"
            onClick={() => setDrawer(true)}
            aria-label={t('menu')}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-control border border-line lg:hidden"
            data-testid="shell-menu"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
            </svg>
          </button>

          <span className="truncate text-[12.5px] text-txt2" data-testid="shell-crumb">
            {consoleLabel}
            {current ? (
              <>
                {' / '}
                <b className="font-semibold text-txt">{t(current.labelKey)}</b>
              </>
            ) : null}
          </span>

          <form
            action={searchHref}
            className="mx-auto hidden max-w-[440px] flex-1 items-center gap-2.5 rounded-[11px] border border-line bg-mist px-3 py-2 md:flex"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className="text-txt2">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
            </svg>
            {/* The accessible name is deliberately short and generic. Using the
                placeholder here made it "Search by molecule or CAS number…",
                which collides with the RFQ wizard's own "CAS number" field
                under any substring-matching accessible-name query. */}
            <input
              name="q"
              placeholder={searchPlaceholder}
              aria-label={searchLabel}
              className="min-w-0 flex-1 border-0 bg-transparent text-[13px] outline-none"
              data-testid="shell-search"
            />
          </form>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            {localeSwitcher}
            {bell}
          </div>
        </div>

        {/* No padding or max-width here on purpose: every page already supplies
            its own `mx-auto max-w-… px-4 py-8`, and a second container would
            double the padding and narrow forty screens at once.
            
            `min-w-0` is not cosmetic. `main` is a flex column, so its children
            default to `min-width: auto` and refuse to shrink below their
            min-content — which made a 390px phone render a 544px page and
            scroll the whole document sideways. */}
        <div className="min-w-0">{children}</div>
      </main>
    </div>
  );
}
