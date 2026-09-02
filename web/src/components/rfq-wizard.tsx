'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { createRfqAction, type ActionState } from '@/lib/actions';
import { ButtonContent, Spinner } from './spinner';

const CERTS = ['US FDA GMP', 'EU GMP', 'WHO PQ', 'CDSCO', 'NMPA'];

type Match = { id: string; name: string; city: string | null; country: string };

export interface RfqInitial {
  productName: string;
  cas: string;
  grade: string | null;
  supplier: string;
}

export function RfqWizard({
  locale,
  initial,
  actingForOrgId,
  actingForOrgName,
}: {
  locale: string;
  initial?: RfqInitial | null;
  /** Set only when a Sourcing Partner (EPIC N7) is drafting this RFQ for a
   *  represented buyer — absent, this component behaves byte-identically to
   *  a buyer drafting their own RFQ. */
  actingForOrgId?: string;
  actingForOrgName?: string;
}) {
  const t = useTranslations('rfq');
  const tp = useTranslations('partnerMandate');
  const router = useRouter();
  const [step, setStep] = useState(1);
  // Pre-filled when the buyer came from a product page — they should never have
  // to retype the product they just clicked on.
  const [cas, setCas] = useState(initial?.cas ?? '');
  const [certs, setCerts] = useState<string[]>([]);
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [loadingMatches, setLoadingMatches] = useState(false);

  const [state, action, pending] = useActionState<ActionState, FormData>(async (prev, fd) => {
    const res = await createRfqAction(prev, fd);
    if (res.ok && res.id) router.push(actingForOrgId ? '/partner/mandates' : `/buyer/rfqs/${res.id}`);
    return res;
  }, {});

  /** Runs the real rule-based match against live DB state before broadcasting. */
  async function loadMatches() {
    setLoadingMatches(true);
    try {
      const qs = new URLSearchParams({ cas });
      certs.forEach((c) => qs.append('cert', c));
      const res = await fetch(`/api/match?${qs}`);
      setMatches(await res.json());
    } finally {
      setLoadingMatches(false);
    }
  }

  const steps = [t('stepProduct'), t('stepSpecs'), t('stepReview')];

  return (
    <form action={action}>
      <input type="hidden" name="locale" value={locale} />
      {actingForOrgId && <input type="hidden" name="actingForOrgId" value={actingForOrgId} />}

      {actingForOrgId && (
        <div className="mb-5 flex items-center gap-3 rounded-panel border-[1.5px] border-violet bg-violet-pale px-4 py-3" data-testid="acting-for-banner">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-violet-deep">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21c1.6-4 4.4-6 8-6s6.4 2 8 6" strokeLinecap="round" />
          </svg>
          <p className="text-sm">
            <span className="font-bold uppercase tracking-wide text-violet-deep">{tp('actingFor')}</span>{' '}
            <span className="font-bold text-txt">{actingForOrgName}</span>
            <span className="ml-1.5 text-xs font-normal text-slate2">— {tp('notYourTransaction')}</span>
          </p>
        </div>
      )}

      <ol className="mb-7 flex items-center">
        {steps.map((label, i) => {
          const n = i + 1;
          const done = n < step;
          const active = n === step;
          return (
            <li key={label} className="flex flex-1 items-center gap-2.5 last:flex-none">
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-[13px] font-bold ${
                  done ? 'border-ok bg-ok text-white' : active ? 'border-brand bg-brand text-white ring-4 ring-brand-pale' : 'border-line bg-white text-muted'
                }`}
              >
                {done ? '✓' : n}
              </span>
              <span className={`text-xs font-semibold ${active ? 'text-brand' : 'text-muted'}`}>{label}</span>
              {n < 3 && <span className={`mx-1 h-0.5 flex-1 ${done ? 'bg-ok' : 'bg-line'}`} />}
            </li>
          );
        })}
      </ol>

      <div className="card space-y-5">
        {initial && (
          <p className="rounded-lg border border-brand-mid bg-brand-pale px-3 py-2.5 text-xs text-indigo-900" data-testid="rfq-prefilled">
            {t('prefilledFrom', { supplier: initial.supplier })}
          </p>
        )}

        {/* Step 1 */}
        <fieldset className={step === 1 ? 'grid gap-4 sm:grid-cols-2' : 'hidden'}>
          <div>
            <label className="label" htmlFor="productName">{t('productName')}</label>
            <input
              id="productName"
              name="productName"
              required
              defaultValue={initial?.productName ?? ''}
              className="input"
              placeholder="Paracetamol (Acetaminophen)"
            />
          </div>
          <div>
            <label className="label" htmlFor="cas">{t('cas')}</label>
            <input id="cas" name="cas" required value={cas} onChange={(e) => setCas(e.target.value)} className="input font-mono" placeholder="103-90-2" />
          </div>
          <div>
            <label className="label" htmlFor="quantityKg">{t('quantity')}</label>
            <input id="quantityKg" name="quantityKg" type="number" min={1} required className="input" placeholder="2000" />
          </div>
          <div>
            <label className="label" htmlFor="requiredBy">{t('requiredBy')}</label>
            <input id="requiredBy" name="requiredBy" type="date" required className="input" />
          </div>
        </fieldset>

        {/* Step 2 */}
        <fieldset className={step === 2 ? 'space-y-4' : 'hidden'}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="grade">{t('grade')}</label>
              <select id="grade" name="grade" className="input" defaultValue={initial?.grade?.split(' / ')[0] ?? 'USP'}>
                <option value="USP">USP</option>
                <option value="IP">IP</option>
                <option value="BP">BP</option>
                <option value="EP">EP</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="minPurity">{t('minPurity')}</label>
              <input id="minPurity" name="minPurity" className="input" placeholder="99.5%" />
            </div>
            <div>
              <label className="label" htmlFor="incoterm">{t('incoterm')}</label>
              <select id="incoterm" name="incoterm" className="input">
                <option>FOB</option>
                <option>CIF</option>
                <option>EXW</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="destination">{t('destination')}</label>
              <input id="destination" name="destination" className="input" placeholder="Nhava Sheva, India" />
            </div>
            <div>
              <label className="label" htmlFor="targetPrice">{t('targetPrice')}</label>
              <input id="targetPrice" name="targetPrice" type="number" step="0.01" className="input" />
            </div>
          </div>

          <div>
            <p className="label">{t('requiredCerts')}</p>
            <p className="mb-2 text-xs text-muted">{t('requiredCertsHint')}</p>
            <div className="flex flex-wrap gap-2">
              {CERTS.map((c) => (
                <label key={c} className="chip cursor-pointer">
                  <input
                    type="checkbox"
                    name="requiredCerts"
                    value={c}
                    checked={certs.includes(c)}
                    onChange={(e) => setCerts((prev) => (e.target.checked ? [...prev, c] : prev.filter((x) => x !== c)))}
                    className="accent-brand"
                  />
                  {c}
                </label>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-slate2">
            <input type="checkbox" name="sampleRequested" className="accent-brand" />
            {t('requestSample')}
          </label>

          <div>
            <label className="label" htmlFor="notes">{t('notes')}</label>
            <textarea id="notes" name="notes" rows={2} className="input" />
          </div>
        </fieldset>

        {/* Step 3 — real matches */}
        <fieldset className={step === 3 ? 'space-y-3' : 'hidden'}>
          <h2 className="text-sm font-bold">{t('matchedSuppliers')}</h2>
          {loadingMatches && (
            <p className="flex items-center gap-2 text-sm text-muted" role="status" aria-live="polite">
              <Spinner className="text-brand" />
              {t('matching')}
            </p>
          )}
          {matches && matches.length === 0 && (
            <p className="rounded-lg border border-amber-300 bg-warn-pale px-3 py-2.5 text-xs text-amber-900" data-testid="no-matches">
              {t('noMatches')}
            </p>
          )}
          {matches && matches.length > 0 && (
            <>
              <p className="text-xs text-muted">{t('matchedBody', { count: matches.length })}</p>
              <ul className="space-y-2">
                {matches.map((m) => (
                  <li key={m.id}>
                    <label className="card flex cursor-pointer items-center gap-3">
                      <input type="checkbox" name="suppliers" value={m.id} defaultChecked className="h-4 w-4 accent-brand" />
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-brand-pale to-brand-mid font-display text-xs font-extrabold text-brand">
                        {m.name.slice(0, 2).toUpperCase()}
                      </span>
                      <span className="flex-1">
                        <span className="block text-sm font-bold">{m.name}</span>
                        <span className="block text-xs text-muted">
                          {m.city}, {m.country}
                        </span>
                      </span>
                      <span className="badge-verified">✓</span>
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}
        </fieldset>

        {state.error && (
          <p role="alert" data-testid="rfq-error" className="rounded-lg bg-danger-pale px-3 py-2 text-xs font-semibold text-red-700">
            {state.error}
          </p>
        )}

        <div className="flex justify-between border-t border-line pt-4">
          <button type="button" onClick={() => setStep((s) => Math.max(1, s - 1))} disabled={step === 1} className="btn-ghost">
            {t('cancel')}
          </button>
          {step < 3 ? (
            <button
              type="button"
              data-testid="rfq-next"
              onClick={() => {
                const next = step + 1;
                setStep(next);
                if (next === 3) loadMatches();
              }}
              className="btn-primary"
            >
              →
            </button>
          ) : (
            <button type="submit" disabled={pending || !matches?.length} className="btn-primary" data-testid="rfq-broadcast">
              <ButtonContent pending={pending} label={t('broadcast', { count: matches?.length ?? 0 })} />
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
