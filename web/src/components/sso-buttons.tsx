'use client';

import { useLocale, useTranslations } from 'next-intl';
import { ssoAction } from '@/lib/auth-actions';

/**
 * Google + SAML (enterprise IdP) sign-in.
 *
 * `googleReady` / `samlReady` are passed down from a SERVER component that reads
 * the real provider config. There is deliberately no NEXT_PUBLIC_* mirror of
 * those flags: two sources of truth drift, and the failure is silent — a
 * configured provider whose button never renders.
 *
 * The buttons always render so the sign-in options are discoverable; when a
 * provider is not configured for the environment the button is simply disabled
 * (reason in the tooltip), rather than vanishing or throwing on click.
 */
export function SsoButtons({
  googleReady,
  samlReady,
  intendedRole,
}: {
  googleReady: boolean;
  samlReady: boolean;
  /** Role picked on the signup page, carried through OAuth so setup needn't re-ask. */
  intendedRole?: 'buyer' | 'seller' | 'both' | 'partner';
}) {
  const t = useTranslations('auth');
  const locale = useLocale();

  const providers = [
    { id: 'google', ready: googleReady, label: t('withGoogle'), icon: <GoogleMark /> },
    { id: 'boxyhq-saml', ready: samlReady, label: t('withSaml'), icon: <span aria-hidden>🏢</span> },
  ];

  return (
    <div className="space-y-2">
      {providers.map((p) =>
        p.ready ? (
          <form key={p.id} action={ssoAction}>
            <input type="hidden" name="provider" value={p.id} />
            <input type="hidden" name="locale" value={locale} />
            {intendedRole && <input type="hidden" name="role" value={intendedRole} />}
            <button type="submit" className="btn-ghost w-full" data-testid={`sso-${p.id}`}>
              {p.icon}
              {p.label}
            </button>
          </form>
        ) : (
          // Unconfigured provider: a plainly disabled button. The reason lives in
          // the tooltip only — no caption cluttering the form for end users.
          <button
            key={p.id}
            type="button"
            disabled
            title={t('ssoNotConfigured')}
            className="btn-ghost w-full cursor-not-allowed opacity-50"
            data-testid={`sso-${p.id}`}
          >
            {p.icon}
            {p.label}
          </button>
        )
      )}

      <div className="relative py-2 text-center">
        <span className="relative z-10 bg-white px-3 text-xs text-muted">{t('orEmail')}</span>
        <span className="absolute left-0 top-1/2 h-px w-full bg-line" />
      </div>
    </div>
  );
}

/** Google's mark, inlined so it never depends on an external asset. */
function GoogleMark() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.76c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
      />
      <path fill="#FBBC05" d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84z" />
      <path
        fill="#EA4335"
        d="M12 4.75c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.46 14.97.5 12 .5A11 11 0 0 0 2.18 7.05l3.66 2.84c.87-2.6 3.3-4.14 6.16-4.14z"
      />
    </svg>
  );
}
