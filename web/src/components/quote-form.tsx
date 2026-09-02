'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { submitQuoteAction, type ActionState } from '@/lib/actions';
import { ButtonContent } from './spinner';
import { ActionFeedback } from '@/components/action-feedback';

/** Quote submission (F4.3) — opens in a dialog from the seller's inquiry list. */
export function QuoteForm({
  rfqId,
  product,
  buyer,
  label,
  actingForOrgId,
  actingForOrgName,
}: {
  rfqId: string;
  product: string;
  buyer: string;
  label: string;
  /** Set only when a Sourcing Partner (EPIC N7) is drafting this quote for a
   *  represented supplier — absent, behaves byte-identically to a supplier
   *  quoting on its own account. */
  actingForOrgId?: string;
  actingForOrgName?: string;
}) {
  const t = useTranslations('quote');
  const tr = useTranslations('rfq');
  const tp = useTranslations('partnerMandate');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ActionState, FormData>(async (prev, fd) => {
    const res = await submitQuoteAction(prev, fd);
    if (res.ok) {
      setOpen(false);
      router.refresh();
    }
    return res;
  }, {});

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn-primary !px-3 !py-1.5 text-xs" data-testid={`quote-btn-${rfqId}`}>
        {label}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4" role="dialog" aria-modal="true">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 text-left">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-extrabold">{t('submitTitle')}</h2>
                <p className="mt-0.5 text-xs text-muted">{t('submitFor', { product, buyer })}</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="close" className="text-xl text-muted">
                ×
              </button>
            </div>

            <form action={action} className="mt-4 space-y-4">
              <input type="hidden" name="rfqId" value={rfqId} />
              {actingForOrgId && <input type="hidden" name="actingForOrgId" value={actingForOrgId} />}
              {actingForOrgId && (
                <div className="flex items-center gap-2.5 rounded-panel border-[1.5px] border-violet bg-violet-pale px-3.5 py-2.5" data-testid="acting-for-banner">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-violet-deep">
                    <circle cx="12" cy="8" r="4" />
                    <path d="M4 21c1.6-4 4.4-6 8-6s6.4 2 8 6" strokeLinecap="round" />
                  </svg>
                  <p className="text-xs">
                    <span className="font-bold uppercase tracking-wide text-violet-deep">{tp('actingFor')}</span>{' '}
                    <span className="font-bold text-txt">{actingForOrgName}</span>
                  </p>
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="unitPrice">{tr('unitPrice')}</label>
                  <input id="unitPrice" name="unitPrice" type="number" step="0.01" min="0.01" required className="input" data-testid="quote-price" />
                </div>
                <div>
                  <label className="label" htmlFor="currency">{t('currency')}</label>
                  <select id="currency" name="currency" className="input">
                    <option>USD</option>
                    <option>EUR</option>
                    <option>INR</option>
                    <option>CNY</option>
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="moqKg">{t('moq')}</label>
                  <input id="moqKg" name="moqKg" type="number" min="1" defaultValue={25} className="input" />
                </div>
                <div>
                  <label className="label" htmlFor="leadTime">{tr('leadTime')}</label>
                  <input id="leadTime" name="leadTime" defaultValue="2 weeks" className="input" />
                </div>
                <div>
                  <label className="label" htmlFor="incoterm">{tr('incoterm')}</label>
                  <input id="incoterm" name="incoterm" defaultValue="FOB Mumbai" className="input" />
                </div>
                <div>
                  <label className="label" htmlFor="paymentTerms">{tr('paymentTerms')}</label>
                  <input id="paymentTerms" name="paymentTerms" defaultValue="30% adv, 70% BL" className="input" />
                </div>
                <div className="sm:col-span-2">
                  <label className="label" htmlFor="validUntil">{t('validity')}</label>
                  <input
                    id="validUntil"
                    name="validUntil"
                    type="date"
                    required
                    defaultValue={new Date(Date.now() + 12096e5).toISOString().slice(0, 10)}
                    className="input"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="label" htmlFor="notes">{t('notes')}</label>
                  <textarea id="notes" name="notes" rows={2} className="input" />
                </div>
              </div>

              {state.error && (
                <p role="alert" className="rounded-lg bg-danger-pale px-3 py-2 text-xs font-semibold text-red-700">
                  {state.error === 'alreadyQuoted' ? t('alreadyQuoted') : state.error}
                </p>
              )}

              <button type="submit" disabled={pending} className="btn-primary w-full" data-testid="quote-submit">
                <ButtonContent pending={pending} label={t('submit')} />
              </button>
                  {/* Confirms the outcome — without it a silent re-render reads as "nothing happened" and users press submit again. */}
      <ActionFeedback state={state} success="Quote submitted" successDescription="The buyer can now compare it against the other quotes." />
</form>
          </div>
        </div>
      )}
    </>
  );
}
