'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { completeSsoAccountAction, type ActionState } from '@/lib/actions';
import { ButtonContent } from './spinner';
import { ConsentLabel } from './consent-label';

type RoleKey = 'buyer' | 'seller' | 'both';

/**
 * Collects what SSO cannot supply: whether the user buys or sells, their real
 * first/last name, a contact number, and their company.
 *
 * The provider gives us an email and a single display name, so those are
 * prefilled — the email read-only, since it is the identity we authenticated.
 * `initialRole` carries the choice made on the signup page so we don't ask twice.
 */
export function AccountSetupForm({
  email,
  fullName,
  initialRole,
}: {
  email: string;
  fullName: string | null;
  initialRole: RoleKey;
}) {
  const t = useTranslations('accountSetup');
  const ts = useTranslations('auth');
  const router = useRouter();
  const [role, setRole] = useState<RoleKey>(initialRole);

  // Google sends one "name" string; split it as a sensible starting point.
  const parts = (fullName ?? '').trim().split(/\s+/).filter(Boolean);
  const firstGuess = parts[0] ?? '';
  const lastGuess = parts.length > 1 ? parts.slice(1).join(' ') : '';

  // Controlled on purpose. React 19 resets uncontrolled inputs once a form
  // action settles, so an unticked-terms rejection would also blank the name,
  // phone and company the user had just typed.
  const [first, setFirst] = useState(firstGuess);
  const [last, setLast] = useState(lastGuess);
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');
  const [country, setCountry] = useState('India');
  const [terms, setTerms] = useState(false);

  const [state, action, pending] = useActionState<ActionState, FormData>(
    async (prev, fd) => {
      fd.set('role', role);
      const res = await completeSsoAccountAction(prev, fd);
      if (res.ok) router.push(role === 'seller' ? '/onboarding/seller' : '/onboarding/buyer');
      return res;
    },
    {},
  );

  const roles: { key: RoleKey; title: string; desc: string; icon: string }[] = [
    { key: 'buyer', title: ts('roleBuyer'), desc: ts('roleBuyerDesc'), icon: '🛒' },
    { key: 'seller', title: ts('roleSeller'), desc: ts('roleSellerDesc'), icon: '🏭' },
    { key: 'both', title: ts('roleBoth'), desc: ts('roleBothDesc'), icon: '🔁' },
  ];

  return (
    <form action={action} className="mt-6 space-y-5" noValidate>
      <fieldset>
        <legend className="label">{ts('iAmA')}</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          {roles.map((r) => (
            <button
              type="button"
              key={r.key}
              onClick={() => setRole(r.key)}
              aria-pressed={role === r.key}
              data-testid={`setup-role-${r.key}`}
              className={`card text-left transition ${role === r.key ? 'border-2 border-brand bg-brand-pale' : 'hover:border-brand-mid'}`}
            >
              <div className="text-xl">{r.icon}</div>
              <p className="mt-1.5 text-sm font-bold">{r.title}</p>
              <p className="mt-0.5 text-xs text-muted">{r.desc}</p>
            </button>
          ))}
        </div>
      </fieldset>

      <div className="card space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="firstName">{t('firstName')}</label>
            <input id="firstName" name="firstName" required value={first} onChange={(e) => setFirst(e.target.value)} autoComplete="given-name" className="input" data-testid="setup-first" />
          </div>
          <div>
            <label className="label" htmlFor="lastName">{t('lastName')}</label>
            <input id="lastName" name="lastName" required value={last} onChange={(e) => setLast(e.target.value)} autoComplete="family-name" className="input" data-testid="setup-last" />
          </div>
          <div>
            <label className="label" htmlFor="setupEmail">{ts('email')}</label>
            {/* Read-only: this is the identity Google authenticated. */}
            <input id="setupEmail" value={email} readOnly disabled className="input cursor-not-allowed opacity-70" data-testid="setup-email" />
          </div>
          <div>
            <label className="label" htmlFor="phone">{t('phone')}</label>
            <input id="phone" name="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" placeholder={t('phonePlaceholder')} className="input" data-testid="setup-phone" />
          </div>
          <div>
            <label className="label" htmlFor="company">{ts('companyName')}</label>
            <input id="company" name="company" required value={company} onChange={(e) => setCompany(e.target.value)} autoComplete="organization" className="input" data-testid="setup-company" />
          </div>
          <div>
            <label className="label" htmlFor="country">{ts('country')}</label>
            <select id="country" name="country" className="input" value={country} onChange={(e) => setCountry(e.target.value)} data-testid="setup-country">
              <option>India</option>
              <option>China</option>
              <option>United States</option>
              <option>Germany</option>
            </select>
          </div>
        </div>

        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="terms" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-0.5 accent-brand" data-testid="setup-terms" />
          {/* SSO skips the signup form entirely, so this is the one place an
              SSO user accepts the terms — the action rejects an unticked box. */}
          <span><ConsentLabel /></span>
        </label>

        {state.error && (
          <p role="alert" className="rounded-lg bg-danger-pale px-3 py-2 text-xs font-semibold text-red-700" data-testid="setup-error">
            {t(state.error)}
          </p>
        )}

        <button type="submit" disabled={pending} className="btn-primary w-full" data-testid="setup-submit">
          <ButtonContent pending={pending} label={t('continue')} />
        </button>
      </div>
    </form>
  );
}
