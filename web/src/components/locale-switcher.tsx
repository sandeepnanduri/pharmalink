'use client';

import { useLocale } from 'next-intl';
import { useTransition } from 'react';
import { usePathname, useRouter } from '@/i18n/routing';
import { routing, LOCALE_LABELS, type Locale } from '@/i18n/routing';

/** Language switcher — keeps the current route and swaps the locale segment. */
export function LocaleSwitcher() {
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  return (
    <select
      aria-label="Language"
      value={locale}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value as Locale;
        startTransition(() => router.replace(pathname, { locale: next }));
      }}
      className="max-w-[6.5rem] rounded-lg border border-white/20 bg-white/10 px-1.5 py-1.5 text-xs font-semibold text-white/90 outline-none hover:bg-white/20 disabled:opacity-50 sm:max-w-none sm:px-2"
    >
      {routing.locales.map((l) => (
        <option key={l} value={l} className="text-ink">
          {LOCALE_LABELS[l]}
        </option>
      ))}
    </select>
  );
}
