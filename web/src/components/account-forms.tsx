'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import {
  updateProfileAction,
  changePasswordAction,
  updateCompanyAction,
  type ActionState,
} from '@/lib/actions';
import { ButtonContent } from './spinner';
import { ActionFeedback } from '@/components/action-feedback';

function Feedback({ state, t }: { state: ActionState; t: (k: string) => string }) {
  if (state.error) {
    return (
      <p role="alert" data-testid="form-error" className="rounded-lg bg-danger-pale px-3 py-2 text-xs font-semibold text-red-700">
        {t(state.error)}
      </p>
    );
  }
  if (state.ok) {
    return (
      <p role="status" data-testid="form-saved" className="rounded-lg bg-ok-pale px-3 py-2 text-xs font-semibold text-green-700">
        ✓ {t('saved')}
      </p>
    );
  }
  return null;
}

/** Personal details. Email is read-only — it is the account identity. */
export function ProfileForm({ name, email, role }: { name: string; email: string; role: string }) {
  const t = useTranslations('account');
  const [state, action, pending] = useActionState<ActionState, FormData>(updateProfileAction, {});

  return (
    <form action={action} className="card space-y-4" data-testid="profile-form">
      <h2 className="text-base font-bold">{t('profile')}</h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="pf-name">{t('name')}</label>
          <input id="pf-name" name="name" defaultValue={name} required minLength={2} className="input" data-testid="profile-name" />
        </div>
        <div>
          <label className="label" htmlFor="pf-email">{t('email')}</label>
          <input id="pf-email" value={email} readOnly disabled className="input bg-surface text-muted" />
          <p className="mt-1 text-[11px] text-muted">{t('emailLocked')}</p>
        </div>
        <div>
          <label className="label" htmlFor="pf-role">{t('role')}</label>
          <input id="pf-role" value={role} readOnly disabled className="input bg-surface text-muted" />
        </div>
      </div>

      <Feedback state={state} t={t} />
      <button type="submit" disabled={pending} className="btn-primary" data-testid="profile-save">
        <ButtonContent pending={pending} label={t('save')} />
      </button>
          {/* Confirms the outcome — without it a silent re-render reads as "nothing happened" and users press submit again. */}
      <ActionFeedback state={state} success="Saved" />
</form>
  );
}

/** Change password. `hasPassword` is false for SSO-only accounts. */
export function PasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const t = useTranslations('account');
  const [state, action, pending] = useActionState<ActionState, FormData>(changePasswordAction, {});

  if (!hasPassword) {
    return (
      <div className="card" data-testid="password-sso">
        <h2 className="text-base font-bold">{t('password')}</h2>
        <p className="mt-2 rounded-lg border border-brand-mid bg-brand-pale px-3 py-2.5 text-xs text-indigo-900">
          🔐 {t('ssoManaged')}
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="card space-y-4" data-testid="password-form">
      <h2 className="text-base font-bold">{t('changePassword')}</h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="pw-current">{t('currentPassword')}</label>
          <input
            id="pw-current"
            name="currentPassword"
            type="password"
            required
            autoComplete="current-password"
            className="input"
            data-testid="pw-current"
          />
        </div>
        <div>
          <label className="label" htmlFor="pw-new">
            {t('newPassword')} <span className="font-normal text-muted">{t('passwordHint')}</span>
          </label>
          <input
            id="pw-new"
            name="newPassword"
            type="password"
            required
            minLength={10}
            autoComplete="new-password"
            className="input"
            data-testid="pw-new"
          />
        </div>
        <div>
          <label className="label" htmlFor="pw-confirm">{t('confirmPassword')}</label>
          <input
            id="pw-confirm"
            name="confirmPassword"
            type="password"
            required
            autoComplete="new-password"
            className="input"
            data-testid="pw-confirm"
          />
        </div>
      </div>

      <Feedback state={state} t={t} />
      <button type="submit" disabled={pending} className="btn-primary" data-testid="pw-save">
        <ButtonContent pending={pending} label={t('updatePassword')} />
      </button>
    </form>
  );
}

export interface CompanyValues {
  name: string;
  regNumber: string;
  city: string;
  country: string;
  website: string;
  about: string;
  defaultIncoterm: string;
  defaultPaymentTerms: string;
  defaultLeadTime: string;
  exportMarkets: string;
  dmfNumbers: string;
  sourcingCategories: string;
  regulatoryMarkets: string;
  preferredOrigins: string;
}

export function CompanyForm({
  values,
  kind,
  locked,
}: {
  values: CompanyValues;
  kind: string;
  locked: boolean;
}) {
  const t = useTranslations('account');
  const [state, action, pending] = useActionState<ActionState, FormData>(updateCompanyAction, {});
  const sells = kind === 'seller' || kind === 'both';
  const buys = kind === 'buyer' || kind === 'both';

  return (
    <form action={action} className="card space-y-4" data-testid="company-form">
      <h2 className="text-base font-bold">{t('company')}</h2>

      {locked && (
        <p className="rounded-lg border border-amber-300 bg-warn-pale px-3 py-2.5 text-xs text-amber-900" data-testid="company-locked">
          🔒 {t('identityLocked')}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="co-name">{t('companyName')}</label>
          <input
            id="co-name"
            name="name"
            defaultValue={values.name}
            readOnly={locked}
            disabled={locked}
            className={`input ${locked ? 'bg-surface text-muted' : ''}`}
            data-testid="company-name"
          />
        </div>
        <div>
          <label className="label" htmlFor="co-reg">{t('regNumber')}</label>
          <input
            id="co-reg"
            name="regNumber"
            defaultValue={values.regNumber}
            readOnly={locked}
            disabled={locked}
            className={`input ${locked ? 'bg-surface text-muted' : ''}`}
          />
        </div>
        <div>
          <label className="label" htmlFor="co-city">{t('city')}</label>
          <input id="co-city" name="city" defaultValue={values.city} className="input" data-testid="company-city" />
        </div>
        <div>
          <label className="label" htmlFor="co-country">{t('country')}</label>
          <input id="co-country" value={values.country} readOnly disabled className="input bg-surface text-muted" />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="co-web">{t('website')}</label>
          <input id="co-web" name="website" type="url" defaultValue={values.website} placeholder="https://" className="input" />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="co-about">{t('about')}</label>
          <textarea id="co-about" name="about" rows={3} defaultValue={values.about} className="input" />
        </div>
      </div>

      {/* Default commercial terms — pre-filled onto new quotes (F2.4). */}
      <h3 className="border-t border-line pt-4 text-sm font-bold">{t('defaultTerms')}</h3>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="co-inco">{t('defaultIncoterm')}</label>
          <input
            id="co-inco"
            name="defaultIncoterm"
            defaultValue={values.defaultIncoterm}
            placeholder="FOB Mumbai"
            className="input"
            data-testid="company-incoterm"
          />
        </div>
        <div>
          <label className="label" htmlFor="co-pay">{t('defaultPaymentTerms')}</label>
          <input
            id="co-pay"
            name="defaultPaymentTerms"
            defaultValue={values.defaultPaymentTerms}
            placeholder="30% adv, 70% BL"
            className="input"
          />
        </div>
        <div>
          <label className="label" htmlFor="co-lead">{t('defaultLeadTime')}</label>
          <input
            id="co-lead"
            name="defaultLeadTime"
            defaultValue={values.defaultLeadTime}
            placeholder="2–3 weeks"
            className="input"
          />
        </div>
      </div>

      {sells && (
        <>
          <h3 className="border-t border-line pt-4 text-sm font-bold">{t('supplierDetails')}</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="co-markets">{t('exportMarkets')}</label>
              <input id="co-markets" name="exportMarkets" defaultValue={values.exportMarkets} placeholder="US, EU, WHO" className="input" />
            </div>
            <div>
              <label className="label" htmlFor="co-dmf">{t('dmfNumbers')}</label>
              <input id="co-dmf" name="dmfNumbers" defaultValue={values.dmfNumbers} placeholder="DMF 32145, CEP …" className="input" data-testid="company-dmf" />
            </div>
          </div>
        </>
      )}

      {buys && (
        <>
          <h3 className="border-t border-line pt-4 text-sm font-bold">{t('sourcingPrefs')}</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="co-cats">{t('sourcingCategories')}</label>
              <input id="co-cats" name="sourcingCategories" defaultValue={values.sourcingCategories} placeholder="API, Excipient" className="input" />
            </div>
            <div>
              <label className="label" htmlFor="co-regm">{t('regulatoryMarkets')}</label>
              <input id="co-regm" name="regulatoryMarkets" defaultValue={values.regulatoryMarkets} placeholder="US, EU, WHO" className="input" />
            </div>
            <div>
              <label className="label" htmlFor="co-orig">{t('preferredOrigins')}</label>
              <input id="co-orig" name="preferredOrigins" defaultValue={values.preferredOrigins} placeholder="India, China" className="input" />
            </div>
          </div>
        </>
      )}

      <Feedback state={state} t={t} />
      <button type="submit" disabled={pending} className="btn-primary" data-testid="company-save">
        <ButtonContent pending={pending} label={t('save')} />
      </button>
    </form>
  );
}
