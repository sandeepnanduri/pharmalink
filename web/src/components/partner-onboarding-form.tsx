'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { submitPartnerOnboardingAction, type ActionState } from '@/lib/partner-actions';
import { PARTNER_ARCHETYPES } from '@/lib/partner';
import { DocumentUpload } from './document-upload';
import { ButtonContent } from './spinner';
import { FieldLabel, FieldError, FormErrorSummary } from './form-field';

/**
 * The Sourcing Partner onboarding wizard (EPIC N7). Same hidden-fieldset +
 * stepper pattern as OnboardingForm (buyer/seller) — a separate component
 * rather than a third branch there, because it posts to a different action
 * with a different shape (a Partner satellite row, not sites/credentials)
 * and the four fields don't share enough with buyer/seller's five to be
 * worth threading through one component.
 *
 * Four steps, not the six sketched in PARTNER-PROGRAM.md's original screen
 * inventory: "network" and "references" are collapsed into explanatory copy
 * here rather than form fields, because there is nowhere to persist them yet
 * — representation is granted BY the represented org later (N7.6), never
 * self-declared at signup, and reference checks are an ops verification
 * step (F2.5), not a data field.
 */
export function PartnerOnboardingForm() {
  const t = useTranslations('partnerOnboarding');
  const tc = useTranslations('common');
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [archetype, setArchetype] = useState('');

  const steps = [t('stepType'), t('stepIdentity'), t('stepSpecialisation'), t('stepAgreement')];
  const last = steps.length;

  const ISSUE_STEP: Record<string, number> = {
    archetypeRequired: 1,
    regNumberRequired: 2,
    rateCardNotAccepted: 4,
  };
  const ISSUE_FIELD: Record<string, string> = { regNumberRequired: 'regNumber' };

  const [state, action, pending] = useActionState<ActionState, FormData>(async (prev, fd) => {
    const res = await submitPartnerOnboardingAction(prev, fd);
    if (res.ok) {
      router.push('/partner');
      return res;
    }
    const jumpTo = (res.issues ?? []).map((i) => ISSUE_STEP[i]).filter(Boolean);
    if (jumpTo.length) setStep(Math.min(...jumpTo));
    return res;
  }, {});

  const issues = (state.issues ?? (state.error ? [state.error] : []))
    .filter((key) => t.has(`issue_${key}`))
    .map((key) => ({ key, message: t(`issue_${key}`), fieldId: ISSUE_FIELD[key] }));
  const has = (key: string) => issues.some((i) => i.key === key);

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
                  done ? 'border-ok bg-ok text-white' : active ? 'border-violet bg-violet text-white ring-4 ring-violet-pale' : 'border-line bg-white text-muted'
                }`}
              >
                {done ? '✓' : n}
              </span>
              <span className={`text-xs font-semibold ${active ? 'text-violet' : 'text-muted'}`}>{label}</span>
              {n < last && <span className={`mx-1 h-0.5 flex-1 ${done ? 'bg-ok' : 'bg-line'}`} />}
            </li>
          );
        })}
      </ol>

      <form id="partner-onboarding-form" action={action} className="card space-y-5">
        <div ref={summaryRef} tabIndex={-1} className="outline-none">
          <FormErrorSummary issues={issues} title={t('errorSummaryTitle', { count: issues.length })} />
        </div>

        {/* Step 1 — type */}
        <fieldset className={step === 1 ? 'space-y-4' : 'hidden'}>
          <p className="label">{t('archetypeTitle')}</p>
          <p className="text-xs text-muted">{t('archetypeHint')}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {PARTNER_ARCHETYPES.map((a) => (
              <button
                type="button"
                key={a}
                onClick={() => setArchetype(a)}
                aria-pressed={archetype === a}
                data-testid={`archetype-${a}`}
                className={`card text-left transition ${archetype === a ? 'border-2 border-violet bg-violet-pale' : 'hover:border-violet'}`}
              >
                <p className="text-sm font-bold">{t(`archetype_${a}`)}</p>
                <p className="mt-0.5 text-xs text-muted">{t(`archetype_${a}_desc`)}</p>
              </button>
            ))}
          </div>
          <input type="hidden" name="archetype" value={archetype} />
        </fieldset>

        {/* Step 2 — identity */}
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
                data-testid="partner-reg-number"
              />
              <FieldError id="regNumber-error" message={has('regNumberRequired') ? t('issue_regNumberRequired') : null} />
            </div>
            <div>
              <FieldLabel htmlFor="taxRegistration">{t('taxRegistration')}</FieldLabel>
              <input id="taxRegistration" name="taxRegistration" className="input" placeholder="GSTIN" />
            </div>
            <div>
              <FieldLabel htmlFor="country">{t('country')}</FieldLabel>
              <select id="country" name="country" className="input" defaultValue="India">
                <option>India</option>
                <option>China</option>
                <option>United States</option>
                <option>Germany</option>
              </select>
            </div>
            <div>
              <FieldLabel htmlFor="city">{t('city')}</FieldLabel>
              <input id="city" name="city" className="input" />
            </div>
          </div>
          <div>
            <p className="label">{t('uploadDoc')}</p>
            <DocumentUpload kind="company_reg" />
          </div>
        </fieldset>

        {/* Step 3 — specialisation */}
        <fieldset className={step === 3 ? 'space-y-4' : 'hidden'}>
          <div>
            <FieldLabel htmlFor="sourcingCategories">{t('sourcingCategories')}</FieldLabel>
            <input id="sourcingCategories" name="sourcingCategories" className="input" placeholder={t('sourcingCategoriesPlaceholder')} />
            <p className="mt-1 text-xs text-muted">{t('sourcingCategoriesHint')}</p>
          </div>
          <div>
            <FieldLabel htmlFor="about">{t('about')}</FieldLabel>
            <textarea id="about" name="about" rows={3} className="input" placeholder={t('aboutPlaceholder')} />
          </div>
        </fieldset>

        {/* Step 4 — agreement */}
        <fieldset className={step === 4 ? 'space-y-4' : 'hidden'}>
          <div className="rounded-card border border-line bg-mist p-4 text-sm text-slate2">
            <p className="font-bold text-txt">{t('whatHappensNextTitle')}</p>
            <p className="mt-1.5">{t('whatHappensNextBody')}</p>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="rateCardAccepted"
              className="mt-0.5 accent-violet"
              aria-invalid={has('rateCardNotAccepted') || undefined}
              data-testid="rate-card-accept"
            />
            <span>{t('rateCardConsent')}</span>
          </label>
          <FieldError message={has('rateCardNotAccepted') ? t('issue_rateCardNotAccepted') : null} />
        </fieldset>

        {state.error && issues.length === 0 && (
          <p role="alert" className="rounded-lg bg-danger-pale px-3 py-2 text-xs font-semibold text-red-700" data-testid="partner-onboarding-error">
            {tc('error')}
          </p>
        )}

        <div className="flex justify-between border-t border-line pt-4">
          <button type="button" onClick={() => setStep((s) => Math.max(1, s - 1))} disabled={step === 1} className="btn-ghost">
            {t('back')}
          </button>
          {step < last ? (
            <button
              type="button"
              onClick={() => setStep((s) => s + 1)}
              disabled={step === 1 && !archetype}
              className="btn-violet"
              data-testid="partner-onboarding-next"
            >
              {t('next')}
            </button>
          ) : (
            <button type="submit" disabled={pending} className="btn-violet" data-testid="partner-onboarding-submit">
              <ButtonContent pending={pending} label={t('submit')} />
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
