'use client';

import { useTranslations } from 'next-intl';
import { CapsuleLoader } from './capsule-loader';

/**
 * The shared body of every route-level `loading.tsx`.
 *
 * A client component so it can translate: `loading.tsx` receives no params, so
 * there is no locale to hand `getTranslations`, but the locale layout already
 * wraps the tree in NextIntlClientProvider — which is in scope here.
 *
 * Purpose is responsiveness, not decoration: without a loading boundary a click
 * on a slow page does nothing visible until the server responds, and people
 * click again thinking it missed.
 */
export function RouteLoading({ titleWidth = 'w-64' }: { titleWidth?: string }) {
  const t = useTranslations('common');
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className={`mb-6 h-8 ${titleWidth} animate-pulse rounded-lg bg-white`} aria-hidden="true" />
      <CapsuleLoader label={t('loading')} size="lg" className="text-brand" />
    </div>
  );
}
