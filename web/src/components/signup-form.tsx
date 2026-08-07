'use client';

import { useActionState, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/routing';
import { signupAction, type ActionState } from '@/lib/actions';
import { ButtonContent } from './spinner';
import { SsoButtons } from './sso-buttons';
import { ConsentLabel } from './consent-label';

type Role = 'buyer' | 'seller' | 'both';

export function SignupForm({ googleReady, samlReady }: { googleReady: boolean; samlReady: boolean }) {
  const t = useTranslations('auth');
  const locale = useLocale();
  const router = useRouter();
  const [role, setRole] = useState<Role>('buyer');
  // Controlled so they survive the action round-trip: React 19 resets
  // uncontrolled fields once a form action settles, so a rejected submission
  // would otherwise blank everything typed. Passwords are left uncontrolled —
  // clearing them on a failed attempt is the conventional behaviour.
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [country, setCountry] = useState('India');
  const [state, action, pending] = useActionState<ActionState, FormData>(async (prev, fd) => {
    const res = await signupAction(prev, fd);
    if (res.ok) router.push(role === 'seller' ? '/onboarding/seller' : '/onboarding/buyer');
    return res;
  }, {});

  const roles: { key: Role; title: string; desc: string; icon: string }[] = [
    { key: 'buyer', title: t('roleBuyer'), desc: t('roleBuyerDesc'), icon: '🛒' },
    { key: 'seller', title: t('roleSeller'), desc: t('roleSellerDesc'), icon: '🏭' },
    { key: 'both', title: t('roleBoth'), desc: t('roleBothDesc'), icon: '🔁' },
  ];

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:py-12">
      <h1 className="text-2xl font-extrabold sm:text-3xl">{t('signUpTitle')}</h1>

      {/* Role first: the choice has to be made BEFORE the SSO buttons, because
          it is carried through the OAuth round-trip (Google returns only an
          email). Sitting below them, it was skipped and setup asked again. */}
      <fieldset className="mt-6">
        <legend className="label">{t('iAmA')}</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          {roles.map((r) => (
            <button
              type="button"
              key={r.key}
              onClick={() => setRole(r.key)}
              aria-pressed={role === r.key}
              data-testid={`role-${r.key}`}
              className={`card text-left transition ${role === r.key ? 'border-2 border-brand bg-brand-pale' : 'hover:border-brand-mid'}`}
            >
              <div className="text-xl">{r.icon}</div>
              <p className="mt-1.5 text-sm font-bold">{r.title}</p>
              <p className="mt-0.5 text-xs text-muted">{r.desc}</p>
            </button>
          ))}
        </div>
      </fieldset>

      {/* SSO must sit OUTSIDE the signup <form>. SsoButtons renders its own
          <form> for the provider action, and a nested form is invalid HTML — the
          browser drops the inner one, hydration fails, and the button silently
          does nothing when clicked. */}
      <div className="card mt-5">
        <SsoButtons googleReady={googleReady} samlReady={samlReady} intendedRole={role} />
      </div>

      <form action={action} className="mt-5 space-y-5" noValidate>
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="role" value={role} />

        <div className="card space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="name">{t('name')}</label>
              <input id="name" name="name" required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className="input" />
            </div>
            <div>
              <label className="label" htmlFor="email">{t('email')}</label>
              <input id="email" name="email" type="email" required autoComplete="email" inputMode="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="company">{t('companyName')}</label>
              <input id="company" name="company" required value={company} onChange={(e) => setCompany(e.target.value)} autoComplete="organization" className="input" />
            </div>
            <div>
              <label className="label" htmlFor="country">{t('country')}</label>
              <select id="country" name="country" className="input" value={country} onChange={(e) => setCountry(e.target.value)}>
                <option>India</option>
                <option>China</option>
                <option>United States</option>
                <option>Germany</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="password">{t('password')}</label>
              <input id="password" name="password" type="password" required minLength={10} autoComplete="new-password" className="input" />
            </div>
            <div>
              <label className="label" htmlFor="confirm">{t('confirmPassword')}</label>
              <input id="confirm" name="confirm" type="password" required autoComplete="new-password" className="input" />
            </div>
          </div>

          <label className="flex items-start gap-2 text-xs text-slate2">
            <input type="checkbox" name="terms" className="mt-0.5 h-4 w-4 shrink-0 accent-brand" />
            <span><ConsentLabel /></span>
          </label>
          <label className="flex items-start gap-2 text-xs text-slate2">
            <input type="checkbox" name="marketing" className="mt-0.5 h-4 w-4 shrink-0 accent-brand" />
            <span>{t('consentMarketing')}</span>
          </label>

          {state.error && (
            <div role="alert" data-testid="signup-error" className="rounded-lg bg-danger-pale px-3 py-2 text-xs text-red-700">
              <p className="font-semibold">{t(state.error)}</p>
              {/* This address is already registered, so the useful next step is
                  signing in to it — carry the email over so it isn't retyped. */}
              {state.error === 'emailTaken' && (
                <p className="mt-1.5">
                  <Link
                    href={{ pathname: '/login', query: email.trim() ? { email: email.trim() } : {} }}
                    className="font-bold underline underline-offset-2"
                    data-testid="signup-signin-instead"
                  >
                    {t('signInInstead')}
                  </Link>{' '}
                  {t('orUseAnotherEmail')}
                </p>
              )}
            </div>
          )}

          <button type="submit" disabled={pending} className="btn-primary w-full">
            <ButtonContent pending={pending} label={t('signUp')} />
          </button>
        </div>
      </form>

      <p className="mt-5 text-center text-sm text-muted">
        {t('haveAccount')}{' '}
        <Link href="/login" className="font-semibold text-brand hover:underline">
          {t('signIn')}
        </Link>
      </p>
    </div>
  );
}
