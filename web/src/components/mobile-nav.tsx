'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/routing';

export interface NavItem {
  href: string;
  label: string;
}

/**
 * Mobile navigation.
 *
 * The desktop <nav> is `hidden md:flex`; without this, every primary
 * destination (dashboard, RFQs, products, billing, ops console) is unreachable
 * on a phone. Buyers approve quotes on the move — this is not optional.
 */
export function MobileNav({ items }: { items: NavItem[] }) {
  const t = useTranslations('nav');
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close on navigation — otherwise the drawer covers the page you just opened.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Don't let the page scroll behind the drawer.
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  // Escape closes it — a drawer with no keyboard exit is a trap.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (items.length === 0) return null;

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={t('menu')}
        aria-expanded={open}
        aria-controls="mobile-nav"
        data-testid="mobile-menu-button"
        // 44px hit target — the iOS/Android minimum for a reliable tap.
        className="flex h-11 w-11 items-center justify-center rounded-lg text-white/80 transition hover:bg-white/10"
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 top-14 z-40 cursor-default bg-ink/40"
          />
          <nav
            id="mobile-nav"
            data-testid="mobile-nav"
            className="fixed inset-x-0 top-14 z-50 border-b border-line bg-white shadow-lift"
          >
            <ul className="max-h-[70vh] overflow-y-auto p-2">
              {items.map((i) => (
                <li key={i.href}>
                  <Link
                    href={i.href}
                    className="flex min-h-11 items-center rounded-lg px-3 py-2.5 text-sm font-semibold text-slate2 transition hover:bg-brand-pale hover:text-brand"
                  >
                    {i.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </>
      )}
    </div>
  );
}
