import { routing, type Locale } from '@/i18n/routing';

/**
 * Canonical site origin. Set NEXT_PUBLIC_SITE_URL in production; the localhost
 * fallback keeps dev/preview working. Every absolute URL (canonical, OG image,
 * sitemap) is derived from this so they can never disagree.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '');

export const SITE_NAME = 'PharmaLink Global';

/** Full URL for a locale-prefixed path, e.g. absoluteUrl('en', '/catalog'). */
export function absoluteUrl(locale: string, path = ''): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  return `${SITE_URL}/${locale}${clean === '/' ? '' : clean}`;
}

/**
 * hreflang alternates for a path: one entry per locale plus x-default.
 * Bilingual sites that omit these get their EN and ZH pages treated as
 * duplicates by search engines — this is the fix.
 */
export function localeAlternates(path = '') {
  const languages: Record<string, string> = {};
  for (const l of routing.locales) languages[l] = absoluteUrl(l, path);
  languages['x-default'] = absoluteUrl(routing.defaultLocale, path);
  return languages;
}

/** OpenGraph locale codes Facebook/LinkedIn expect. */
export function ogLocale(locale: Locale): string {
  return locale === 'zh' ? 'zh_CN' : 'en_US';
}

/** Serializes JSON-LD for a <script type="application/ld+json"> tag. */
export function jsonLd(data: Record<string, unknown>): string {
  // Escape < to avoid closing the script tag from within a string value.
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
