'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { importProductsAction, type ProductActionState } from '@/lib/product-actions';
import { ButtonContent } from './spinner';

/** Paste-a-CSV bulk product importer. New rows land as drafts for review. */
export function BulkImport() {
  const t = useTranslations('products');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ProductActionState, FormData>(
    async (prev, fd) => {
      const res = await importProductsAction(prev, fd);
      if (res.ok) router.refresh();
      return res;
    },
    {},
  );

  return (
    <div className="w-full">
      <button type="button" onClick={() => setOpen((o) => !o)} className="btn-ghost" data-testid="bulk-import-toggle">
        📁 {t('bulkImport')}
      </button>
      {open && (
        <form action={action} className="card mt-3">
          <label className="label" htmlFor="csvIn">{t('csvPaste')}</label>
          <textarea
            id="csvIn"
            name="csv"
            rows={5}
            placeholder="name,cas,category,grade,purity,moqKg,leadTime,priceMin,priceMax"
            className="input font-mono text-xs"
            data-testid="csv-textarea"
          />
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button type="submit" disabled={pending} className="btn-primary" data-testid="csv-import">
              <ButtonContent pending={pending} label={t('import')} />
            </button>
            {state.ok && <span className="text-xs font-semibold text-ok" data-testid="import-result">✓ {t('imported', { n: state.imported ?? 0 })}</span>}
            {state.error && <span className="text-xs font-semibold text-red-700" data-testid="import-error">{t(state.error)}</span>}
          </div>
          {/* Which rows failed and why. `csv.ts` has always collected these — it
              refuses to drop a row silently — but nothing rendered them, so a
              rejected paste gave the seller no way to find the bad cell.
              TODO(i18n): these strings come from `csv.ts` in English. They move
              to machine codes rendered through the message catalogue when the
              workbook importer lands, so both import paths speak one vocabulary. */}
          {!!state.rowErrors?.length && (
            <ul className="mt-2 space-y-0.5 text-xs text-red-700" data-testid="import-row-errors">
              {state.rowErrors.map((e) => (
                <li key={e} className="font-mono">
                  {e}
                </li>
              ))}
            </ul>
          )}
        </form>
      )}
    </div>
  );
}
