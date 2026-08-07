'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { counterOfferAction, respondCounterAction, type FulfillmentState } from '@/lib/fulfillment-actions';
import type { ThreadRow } from '@/lib/negotiation';
import { ButtonContent } from './spinner';
import { ActionFeedback } from '@/components/action-feedback';

/** Structured counter-offer thread for one quote (used by buyer and seller). */
export function NegotiationPanel({
  quoteId,
  currency,
  rows,
  canRespondId,
  canProposeFlag,
}: {
  quoteId: string;
  currency: string;
  rows: ThreadRow[];
  canRespondId: string | null;
  canProposeFlag: boolean;
}) {
  const t = useTranslations('negotiate');
  const router = useRouter();
  const [state, action, pending] = useActionState<FulfillmentState, FormData>(
    async (prev, fd) => {
      fd.set('quoteId', quoteId);
      const res = await counterOfferAction(prev, fd);
      if (res.ok) router.refresh();
      return res;
    },
    {},
  );

  return (
    <div className="mt-2 rounded-lg border border-line bg-surface p-3" data-testid={`negotiation-${quoteId}`}>
      {rows.length > 0 && (
        <ul className="space-y-1 text-xs">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-1.5">
              <span className={`font-semibold ${r.side === 'you' ? 'text-brand' : ''}`}>{r.side === 'you' ? t('you') : t('them')}</span>
              <span className="font-mono">{currency} {r.proposedPrice}/kg</span>
              {r.note && <span className="text-muted">— {r.note}</span>}
              <span className="text-muted">({t(`st_${r.status}`)})</span>
              {r.id === canRespondId && (
                <span className="ml-1 inline-flex gap-2">
                  <form action={respondCounterAction} className="inline">
                    <input type="hidden" name="counterId" value={r.id} />
                    <input type="hidden" name="decision" value="accept" />
                    <button type="submit" className="font-semibold text-ok hover:underline" data-testid={`counter-accept-${r.id}`}>{t('accept')}</button>
                        {/* Confirms the outcome — without it a silent re-render reads as "nothing happened" and users press submit again. */}
      <ActionFeedback state={state} success="Counter-offer sent" successDescription="The other party has been notified." />
</form>
                  <form action={respondCounterAction} className="inline">
                    <input type="hidden" name="counterId" value={r.id} />
                    <input type="hidden" name="decision" value="decline" />
                    <button type="submit" className="font-semibold text-red-700 hover:underline" data-testid={`counter-decline-${r.id}`}>{t('decline')}</button>
                  </form>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {canProposeFlag && (
        <form action={action} className="mt-2 flex flex-wrap items-end gap-2">
          <div>
            <label className="label text-[11px]">{t('counterPrice')}</label>
            <input name="price" type="number" step="0.01" min="0.01" required className="input !w-28 !py-1 text-xs" data-testid={`counter-price-${quoteId}`} />
          </div>
          <input name="note" placeholder={t('note')} className="input !py-1 text-xs" maxLength={300} />
          <button type="submit" disabled={pending} className="btn-ghost !py-1 text-xs" data-testid={`counter-submit-${quoteId}`}>
            <ButtonContent pending={pending} label={t('counter')} />
          </button>
        </form>
      )}
      {state.error && <p className="mt-1 text-xs font-semibold text-red-700">{t(state.error)}</p>}
    </div>
  );
}
