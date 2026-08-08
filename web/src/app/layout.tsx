/**
 * Root layout — deliberately a pass-through.
 *
 * The real document (`<html>`, `<body>`, fonts, providers) is built by
 * `[locale]/layout.tsx`, because every real page in this app is locale-scoped
 * and the lang attribute depends on which locale was matched.
 *
 * This file still has to exist. Next requires a root layout above
 * `app/not-found.tsx`, and without one it does not fall back — it throws
 * "not-found.tsx doesn't have a root layout" and answers **500**. So for a
 * period every unmatched URL in the app returned a server error instead of a
 * 404: not just the dead admin link that surfaced it, but any stale bookmark,
 * any mistyped path, any record id belonging to another organisation. A 500
 * tells a user (and a crawler) that the site is broken rather than that the
 * page is gone.
 *
 * Returning `children` untouched is the documented next-intl arrangement: this
 * layout adds no markup, `[locale]/layout.tsx` renders the document for pages
 * that matched, and `not-found.tsx` renders its own minimal document for the
 * requests that never reached a locale at all.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
