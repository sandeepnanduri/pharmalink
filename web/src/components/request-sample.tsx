'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { requestSampleAction, type SampleState } from '@/lib/sample-actions';
import { ButtonContent } from './spinner';
import { ActionFeedback } from '@/components/action-feedback';

/** Buyer's "request a sample" control on a product page. */
export function RequestSample({ productId, existingStatus }: { productId: string; existingStatus: string | null }) {
  const t = useTranslations('samples');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<SampleState, FormData>(
    async (prev, fd) => {
      fd.set('productId', productId);
      const res = await requestSampleAction(prev, fd);
      if (res.ok) {
        router.refresh();
        setOpen(false);
      }
      return res;
    },
    {},
  );

  if (existingStatus && existingStatus !== 'declined') {
    return (
      <p className="text-xs font-semibold text-brand" data-testid="sample-status">
        🧪 {t('yourRequest')}: {t(`st_${existingStatus}`)}
      </p>
    );
  }

  return (
    <div>
      <button type="button" onClick={() => setOpen((o) => !o)} className="btn-ghost !py-1.5 text-xs" data-testid="request-sample">
        🧪 {t('requestSample')}
      </button>
      {open && (
        <form action={action} className="mt-2 space-y-2 rounded-lg border border-line p-3">
          <input name="quantityG" type="number" min="1" placeholder={t('quantityG')} className="input !py-1 text-xs" data-testid="sample-qty" />
          <input name="shipTo" placeholder={t('shipTo')} className="input !py-1 text-xs" />
          <input name="note" placeholder={t('note')} className="input !py-1 text-xs" />
          {state.error && <p className="text-xs font-semibold text-red-700">{t(state.error)}</p>}
          <button type="submit" disabled={pending} className="btn-primary !py-1 text-xs" data-testid="sample-submit">
            <ButtonContent pending={pending} label={t('send')} />
          </button>
              {/* Confirms the outcome — without it a silent re-render reads as "nothing happened" and users press submit again. */}
      <ActionFeedback state={state} success="Sample requested" successDescription="The supplier has been notified and will approve or decline." />
</form>
      )}
    </div>
  );
}
