'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';

/**
 * Consent wording with the two legal documents linked inline.
 *
 * The catalog string carries <terms>/<privacy> tags so each locale controls
 * where the links sit in its own sentence. `target="_blank"` keeps a half-filled
 * signup form intact when someone stops to read.
 */
export function ConsentLabel({ messageKey = 'consentTerms' }: { messageKey?: 'consentTerms' | 'legalNote' }) {
  const t = useTranslations('auth');
  return (
    <>
      {t.rich(messageKey, {
        terms: (chunks) => (
          <Link href="/legal/terms" target="_blank" className="font-semibold text-brand hover:underline" data-testid="link-terms">
            {chunks}
          </Link>
        ),
        privacy: (chunks) => (
          <Link href="/legal/privacy" target="_blank" className="font-semibold text-brand hover:underline" data-testid="link-privacy">
            {chunks}
          </Link>
        ),
      })}
    </>
  );
}
