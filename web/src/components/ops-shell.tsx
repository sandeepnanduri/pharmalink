'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Link } from '@/i18n/routing';

/**
 * The operations console shell — dark sidebar, light content area.
 *
 * Ported from `app/index.html` in the redesign kit, whose rules this follows:
 * the hexagon is the brand motif for icon containers and avatars (never a
 * circle or a rounded square), JetBrains Mono carries every identifying number,
 * teal marks verified state, and the console never becomes a fully dark data
 * table view — dark chrome, light content.
 *
 * Structural, not cosmetic: before this the admin pages rendered inside the
 * marketing navbar, which is `sticky top-0 z-50` and overlapped admin tables on
 * scroll. Ops now has its own sticky topbar and nothing above it.
 */

export interface OpsNavItem {
  href: string;
  label: string;
  icon: keyof typeof ICONS;
  /** A live count shown as a pill — e.g. how many orgs are waiting on review. */
  count?: number;
}

export interface OpsNavGroup {
  label: string;
  items: OpsNavItem[];
}

/**
 * Inline 16px stroke icons matching the kit's set. Inline rather than a sprite
 * or an icon package: there are seven of them, and the CSP forbids external
 * fetches anyway.
 */
const ICONS = {
  dashboard: (
    <>
      <rect x="3" y="3" width="8" height="8" rx="2" /><rect x="13" y="3" width="8" height="5" rx="2" />
      <rect x="13" y="10" width="8" height="11" rx="2" /><rect x="3" y="13" width="8" height="8" rx="2" />
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
      <circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c1.2-3.2 3.6-5 6.5-5s5.3 1.8 6.5 5" strokeLinecap="round" />
      <circle cx="17.5" cy="9" r="2.5" /><path d="M16.5 15.2c2.4.3 4.1 1.7 5 4" strokeLinecap="round" />
    </>
  ),
  chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" strokeLinecap="round" />,
  upload: (
    <>
      <path d="M12 16V4M8 8l4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" strokeLinecap="round" />
    </>
  ),
} as const;

function Icon({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className="shrink-0 opacity-75">
      {ICONS[name]}
    </svg>
  );
}

/** Locale prefix stripped, so `/en/admin/products` compares as `/admin/products`. */
function useOpsPath() {
  const pathname = usePathname() ?? '';
  return pathname.replace(/^\/[a-z]{2}(?=\/|$)/, '') || '/';
}

function NavLink({ item, onNavigate }: { item: OpsNavItem; onNavigate?: () => void }) {
  const path = useOpsPath();
  // Exact match for the console root, prefix match for its sections — otherwise
  // `/admin` would light up on every page underneath it.
  const active = item.href === '/admin' ? path === '/admin' : path.startsWith(item.href);

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      data-testid={`ops-nav-${item.href.replace(/\W+/g, '-').replace(/^-|-$/g, '')}`}
      className={`relative flex items-center gap-3 rounded-control px-2.5 py-2.5 text-[13.5px] font-medium transition ${
        active
          ? 'bg-gradient-to-r from-teal/[0.16] to-teal/[0.05] text-white before:absolute before:-left-3.5 before:bottom-[20%] before:top-[20%] before:w-[3px] before:rounded-r-[3px] before:bg-teal before:content-[""]'
          : 'text-txt-inv2 hover:bg-white/5 hover:text-white'
      }`}
    >
      <Icon name={item.icon} />
      <span className="truncate">{item.label}</span>
      {item.count ? (
        <span className="ml-auto rounded-pill bg-teal px-1.5 py-0.5 font-mono text-[10.5px] font-bold text-ink">{item.count}</span>
      ) : null}
    </Link>
  );
}

function Sidebar({
  groups,
  user,
  signOut,
  onNavigate,
}: {
  groups: OpsNavGroup[];
  user: OpsUser;
  signOut: React.ReactNode;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex h-full flex-col bg-ink text-txt-inv2">
      <div className="flex items-center gap-2.5 px-5 pb-4 pt-5 font-display text-[17px] font-bold text-white">
        {/* The hexagon is the benzene ring — the brand mark, not decoration. */}
        <span className="hex grid h-8 w-7 place-items-center bg-brand-gradient text-[13px]">◆</span>
        <span>
          Pharma<em className="not-italic text-teal">Link</em>
        </span>
        <span className="ml-auto rounded-md border border-teal/40 px-1.5 py-0.5 font-mono text-[9.5px] font-extrabold tracking-widest text-teal-bright">
          OPS
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto pb-4">
        {groups.map((group) => (
          <div key={group.label} className="px-3.5 pb-1 pt-3.5">
            <div className="mb-1.5 px-2.5 text-[10px] font-bold uppercase tracking-[1.8px] text-txt-inv2/70">{group.label}</div>
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
          {/* The account, not a friendly first name. In a console where every
              action lands in the audit log, which account you are acting as is
              the thing worth showing. */}
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

export interface OpsUser {
  email: string;
  initial: string;
  roleLabel: string;
}

export function OpsShell({
  groups,
  user,
  signOut,
  children,
  searchPlaceholder,
  consoleLabel,
}: {
  groups: OpsNavGroup[];
  user: OpsUser;
  /** The sign-out form, passed in because it wraps a server action. */
  signOut: React.ReactNode;
  children: React.ReactNode;
  searchPlaceholder: string;
  consoleLabel: string;
}) {
  const [drawer, setDrawer] = useState(false);
  const path = useOpsPath();
  const current = groups.flatMap((g) => g.items).find((i) => (i.href === '/admin' ? path === '/admin' : path.startsWith(i.href)));

  return (
    <div className="grid min-h-screen lg:grid-cols-[248px_1fr]" data-testid="ops-shell">
      {/* Desktop rail. The column carries the ink background and the rail inside
          it is sticky, so a page taller than the viewport scrolls under a rail
          that stays put — rather than leaving a white strip below it where the
          sticky element ends. */}
      <div className="hidden bg-ink lg:block">
        <aside className="sticky top-0 h-screen">
          <Sidebar groups={groups} user={user} signOut={signOut} />
        </aside>
      </div>

      {/* Mobile drawer. The rail is 248px; below `lg` that is most of a phone. */}
      {drawer && (
        <>
          <button
            type="button"
            aria-label="Close navigation"
            className="fixed inset-0 z-40 bg-ink/60 lg:hidden"
            onClick={() => setDrawer(false)}
          />
          <div className="fixed inset-y-0 left-0 z-50 w-64 lg:hidden">
            <Sidebar groups={groups} user={user} signOut={signOut} onNavigate={() => setDrawer(false)} />
          </div>
        </>
      )}

      {/* Light content on dark chrome — the kit is explicit that the console
          never becomes a fully dark data-table view. */}
      <main className="flex min-w-0 flex-col bg-mist">
        <div className="sticky top-0 z-30 flex items-center gap-4 border-b border-line bg-white px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={() => setDrawer(true)}
            aria-label="Open navigation"
            className="grid h-9 w-9 place-items-center rounded-control border border-line lg:hidden"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
            </svg>
          </button>

          <span className="truncate text-[12.5px] text-txt2" data-testid="ops-crumb">
            {consoleLabel} / <b className="font-semibold text-txt">{current?.label ?? ''}</b>
          </span>

          {/* Search posts to catalogue moderation — the one ops list big enough
              to need finding rather than scanning. */}
          <form action="/en/admin/products" className="mx-auto hidden max-w-[440px] flex-1 items-center gap-2.5 rounded-[11px] border border-line bg-mist px-3 py-2 md:flex">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className="text-txt2">
              <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" strokeLinecap="round" />
            </svg>
            <input
              name="q"
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="min-w-0 flex-1 border-0 bg-transparent text-[13px] outline-none"
              data-testid="ops-search"
            />
          </form>

          <Link
            href="/notifications"
            aria-label="Notifications"
            className="relative grid h-[34px] w-[34px] place-items-center rounded-control border border-line bg-white transition hover:border-[#C9DBE8]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8z" strokeLinejoin="round" />
              <path d="M13.7 21a2 2 0 0 1-3.4 0" strokeLinecap="round" />
            </svg>
          </Link>
        </div>

        <div className="mx-auto w-full max-w-[1240px] px-4 py-6 sm:px-6">{children}</div>
      </main>
    </div>
  );
}
