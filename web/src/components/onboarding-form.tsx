'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { submitOnboardingAction, type ActionState } from '@/lib/actions';
import { DocumentUpload } from './document-upload';
import { ButtonContent } from './spinner';
import { SiteRows } from './site-rows';
import { CredentialRows } from './credential-rows';
import { FieldLabel, FieldError, FormErrorSummary } from './form-field';
import { SUPPLIER_TYPES, SELLER_CREDENTIALS, BUYER_CREDENTIALS, requiresSite } from '@/lib/onboarding';

/** Which wizard step each validation issue belongs to, so we can jump there. */
const ISSUE_STEP: Record<string, number> = {
  regNumberRequired: 2,
  siteRequiredForManufacturer: 3,
  licenceNumberRequired: 4,
  credentialExpiryInPast: 4,
};
/** The control each issue should focus when its summary entry is clicked. */
const ISSUE_FIELD: Record<string, string> = {
  regNumberRequired: 'regNumber',
};

const BUYER_TYPES = ['finished-dosage', 'cdmo', 'generic', 'trader'];

export function OnboardingForm({ kind }: { kind: 'buyer' | 'seller' }) {
  const t = useTranslations('onboarding');
  const tc = useTranslations('common');
  const router = useRouter();
  const [step, setStep] = useState(1);
  // Drives whether a site is mandatory: only orgs that physically make product
  // need one, and the requirement has to react as the user changes the answer.
  const [supplierType, setSupplierType] = useState<string>('manufacturer');

  const steps =
    kind === 'seller'
      ? [t('stepAccount'), t('stepCompany'), t('stepSites'), t('stepCredentials'), t('stepProducts')]
      : [t('stepAccount'), t('stepCompany'), t('stepLicences'), t('stepPreferences')];
  const last = steps.length;

  const [state, action, pending] = useActionState<ActionState, FormData>(async (prev, fd) => {
    const res = await submitOnboardingAction(prev, fd);
    if (res.ok) {
      router.push(kind === 'seller' ? '/seller' : '/buyer');
      return res;
    }
    // Jump to the earliest step that has a problem, so the user lands on
    // something they can actually fix rather than staring at the last page.
    const steps = (res.issues ?? []).map((i) => ISSUE_STEP[i]).filter(Boolean);
    if (steps.length) setStep(Math.min(...steps));
    return res;
  }, {});

  // Every failure, in wording the user can act on.
  const issues = (state.issues ?? (state.error ? [state.error] : []))
    .filter((key) => t.has(`issue_${key}`))
    .map((key) => ({ key, message: t(`issue_${key}`), fieldId: ISSUE_FIELD[key] }));
  const has = (key: string) => issues.some((i) => i.key === key);

  // Move focus to the summary when it appears. Without this the announcement
  // fires but keyboard and screen-reader users stay where they were, with no
  // idea the submit failed.
  const summaryRef = useRef<HTMLDivElement>(null);
  const issueCount = issues.length;
  useEffect(() => {
    if (issueCount > 0) {
      summaryRef.current?.focus();
      summaryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [issueCount, state]);

  return (
    <div>
      {/* Stepper */}
      <ol className="mb-7 flex items-center" aria-label="progress">
        {steps.map((label, i) => {
          const n = i + 1;
          const done = n < step;
          const active = n === step;
          return (
            <li key={label} className="flex flex-1 items-center gap-2.5 last:flex-none">
              <span
                aria-current={active ? 'step' : undefined}
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-[13px] font-bold ${
                  done
                    ? 'border-ok bg-ok text-white'
                    : active
                      ? 'border-brand bg-brand text-white ring-4 ring-brand-pale'
                      : 'border-line bg-white text-muted'
                }`}
              >
                {done ? '✓' : n}
              </span>
              <span className={`text-xs font-semibold ${active ? 'text-brand' : 'text-muted'}`}>{label}</span>
              {n < last && <span className={`mx-1 h-0.5 flex-1 ${done ? 'bg-ok' : 'bg-line'}`} />}
            </li>
          );
        })}
      </ol>

      <form id="onboarding-form" action={action} className="card space-y-5">
        {/* Errors go FIRST: a summary below the fields is a summary nobody
            reads. Every problem is listed at once and each entry focuses its
            field, so a long form does not become a scavenger hunt. */}
        <div ref={summaryRef} tabIndex={-1} className="outline-none">
          <FormErrorSummary issues={issues} title={t('errorSummaryTitle', { count: issues.length })} />
        </div>

        {/* Step 1 — account (already captured at signup; shown read-only for continuity) */}
        <fieldset className={step === 1 ? '' : 'hidden'}>
          <p className="text-sm text-muted">
            {t('step', { n: 1 })} — {steps[0]} ✓
          </p>
        </fieldset>

        {/* Step 2 — company */}
        <fieldset className={step === 2 ? 'space-y-4' : 'hidden'}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <FieldLabel htmlFor="regNumber" required>
                {t('regNumber')}
              </FieldLabel>
              <input
                id="regNumber"
                name="regNumber"
                required
                aria-required="true"
                aria-invalid={has('regNumberRequired') || undefined}
                aria-describedby={has('regNumberRequired') ? 'regNumber-error' : undefined}
                className={`input ${has('regNumberRequired') ? 'input-error' : ''}`}
                placeholder="27ABCDE1234F1Z5"
                data-testid="reg-number"
              />
              <FieldError
                id="regNumber-error"
                message={has('regNumberRequired') ? t('issue_regNumberRequired') : null}
              />
            </div>
            <div>
              <FieldLabel htmlFor="city">{t('city')}</FieldLabel>
              <input id="city" name="city" className="input" />
            </div>
            {kind === 'buyer' ? (
              <div>
                <label className="label" htmlFor="companyType">
                  {t('companyType')}
                </label>
                <select id="companyType" name="companyType" className="input">
                  {BUYER_TYPES.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <>
                {/* Manufacturer vs intermediary. A reseller presenting as the
                    manufacturer is the main counterparty fraud in API trade, so
                    this is asked outright rather than inferred. */}
                <div>
                  <label className="label" htmlFor="supplierType">
                    {t('supplierType')}
                  </label>
                  <select
                    id="supplierType"
                    name="supplierType"
                    value={supplierType}
                    onChange={(e) => setSupplierType(e.target.value)}
                    className="input"
                    data-testid="supplier-type"
                  >
                    {SUPPLIER_TYPES.map((s) => (
                      <option key={s} value={s}>
                        {t(`supplierType_${s}`)}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-muted">{t('supplierTypeHint')}</p>
                </div>
                <div>
                  <label className="label" htmlFor="exportMarkets">
                    {t('exportMarkets')}
                  </label>
                  <input id="exportMarkets" name="exportMarkets" className="input" placeholder="US, EU, WHO" />
                </div>
              </>
            )}
            <div className="sm:col-span-2">
              <label className="label" htmlFor="about">
                {t('about')}
              </label>
              <textarea id="about" name="about" rows={3} className="input" />
            </div>
          </div>
        </fieldset>

        {/* Step 3 — sites (seller) / licences (buyer) */}
        <fieldset className={step === 3 ? 'space-y-4' : 'hidden'}>
          {kind === 'seller' ? (
            <>
              <p className="label">{t('sitesTitle')}</p>
              <p className="text-xs text-muted">{t('sitesHint')}</p>
              <SiteRows required={requiresSite(supplierType)} />
            </>
          ) : (
            <>
              <p className="label">{t('licencesTitle')}</p>
              <p className="text-xs text-muted">{t('buyerLicenceHint')}</p>
              <CredentialRows options={BUYER_CREDENTIALS} />
              <div>
                <p className="label">{t('uploadDoc')}</p>
                <DocumentUpload kind="drug_licence" />
              </div>
            </>
          )}
        </fieldset>

        {/* Step 4 — credentials (seller) / preferences (buyer) */}
        <fieldset className={step === 4 ? 'space-y-4' : 'hidden'}>
          {kind === 'seller' ? (
            <>
              <p className="label">{t('credentialsTitle')}</p>
              <p className="text-xs text-muted">{t('credentialsHint')}</p>
              <CredentialRows options={SELLER_CREDENTIALS} />

              <div>
                <p className="label">{t('uploadDoc')}</p>
                {/* Real upload: bytes are stored server-side and SHA-256 hashed.
                    Lives outside the onboarding <form> (nested forms are invalid HTML).
                    The returned id is pasted into a credential's document field,
                    which is what links a claim to its evidence. */}
                <DocumentUpload kind="gmp_cert" />
              </div>
            </>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="markets">
                  {t('exportMarkets')}
                </label>
                <input id="markets" name="exportMarkets" className="input" placeholder="US, EU, WHO, India" />
              </div>
            </div>
          )}
        </fieldset>

        {/* Step 5 — seller products note */}
        <fieldset className={step === 5 ? 'space-y-3' : 'hidden'}>
          <p className="text-sm text-slate2">{t('submittedBody')}</p>
        </fieldset>

        {/* Only for failures we have no specific wording for — a genuine
            unexpected error, not a validation result. */}
        {state.error && issues.length === 0 && (
          <p role="alert" className="rounded-lg bg-danger-pale px-3 py-2 text-xs font-semibold text-red-700" data-testid="onboarding-error">
            {tc('error')}
          </p>
        )}

        <div className="flex justify-between border-t border-line pt-4">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            disabled={step === 1}
            className="btn-ghost"
          >
            {t('back')}
          </button>
          {step < last ? (
            <button type="button" onClick={() => setStep((s) => s + 1)} className="btn-primary" data-testid="onboarding-next">
              {t('next')}
            </button>
          ) : (
            <button type="submit" disabled={pending} className="btn-primary" data-testid="onboarding-submit">
              <ButtonContent pending={pending} label={t('submit')} />
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
