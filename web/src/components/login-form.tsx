'use client';

import { useActionState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { loginAction } from '@/lib/auth-actions';
import type { ActionState } from '@/lib/actions';
import { ButtonContent } from './spinner';
import { SsoButtons } from './sso-buttons';
import { ConsentLabel } from './consent-label';

export function LoginForm({
  googleReady,
  samlReady,
  initialEmail = '',
}: {
  googleReady: boolean;
  samlReady: boolean;
  initialEmail?: string;
}) {
  const t = useTranslations('auth');
  const locale = useLocale();
  const [state, action, pending] = useActionState<ActionState, FormData>(loginAction, {});

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10 sm:py-12">
      <h1 className="text-2xl font-extrabold sm:text-3xl">{t('signInTitle')}</h1>

      <div className="card mt-6">
        <SsoButtons googleReady={googleReady} samlReady={samlReady} />

        <form action={action} className="space-y-4" noValidate>
          <input type="hidden" name="locale" value={locale} />
          <div>
            <label className="label" htmlFor="email">
              {t('email')}
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              className="input"
              defaultValue={initialEmail}
              autoFocus={!initialEmail}
            />
          </div>
          <div>
            <label className="label" htmlFor="password">
              {t('password')}
            </label>
            <input id="password" name="password" type="password" required autoComplete="current-password" className="input" />
          </div>

          {state.error && (
            <p role="alert" data-testid="login-error" className="rounded-lg bg-danger-pale px-3 py-2 text-xs font-semibold text-red-700">
              {t(state.error)}
            </p>
          )}

          <button type="submit" disabled={pending} className="btn-primary w-full">
            <ButtonContent pending={pending} label={t('signIn')} />
          </button>
        </form>
      </div>

      <p className="mt-5 text-center text-sm text-muted">
        {t('noAccount')}{' '}
        <Link href="/signup" className="font-semibold text-brand hover:underline">
          {t('signUp')}
        </Link>
      </p>

      <p className="mt-4 text-center text-xs text-muted">
        <ConsentLabel messageKey="legalNote" />
      </p>
    </div>
  );
}
