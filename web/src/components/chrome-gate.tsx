'use client';

import { usePathname } from 'next/navigation';

/**
 * Hides the marketing chrome on the ops console.
 *
 * The redesign kit calls out that "the admin reuses the marketing navbar" with
 * a sticky-overlap bug on scroll, and prescribes a proper ops shell instead:
 * dark sidebar, own breadcrumb, own search. Two headers, one of them
 * `sticky top-0 z-50`, is the bug.
 *
 * The obvious fix — route groups, moving every non-admin folder into `(site)`
 * so the header lives beside the ops shell rather than above it — means moving
 * twenty-one route folders and finding a new home for `not-found.tsx`, which
 * would then render chrome-less. This is the same outcome for fifteen lines.
 *
 * `usePathname()` resolves during server rendering as well as on the client, so
 * the header is absent from the very first byte: no flash, no hydration
 * mismatch. `children` is the server-rendered header passed through as an RSC
 * payload — this component decides whether to place it, it does not re-render
 * it.
 */
export function ChromeGate({ children, hideOn }: { children: React.ReactNode; hideOn: string[] }) {
  const pathname = usePathname() ?? '';
  // Locale-prefixed, so match on the segment after `/{locale}`.
  const withoutLocale = pathname.replace(/^\/[a-z]{2}(?=\/|$)/, '');
  const hidden = hideOn.some((p) => withoutLocale === p || withoutLocale.startsWith(`${p}/`));
  return hidden ? null : <>{children}</>;
}
