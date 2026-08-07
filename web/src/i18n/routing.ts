import { defineRouting } from 'next-intl/routing';
import { createNavigation } from 'next-intl/navigation';

/**
 * Locales. China is a first-class market for API sourcing (NMPA-regulated
 * suppliers + Chinese buyers), so Simplified Chinese ships in Phase 1 rather
 * than waiting for the Phase-3 localisation item.
 */
export const routing = defineRouting({
  locales: ['en', 'zh'],
  defaultLocale: 'en',
  localePrefix: 'always',
});

export type Locale = (typeof routing.locales)[number];

export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  zh: '简体中文',
};

export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
