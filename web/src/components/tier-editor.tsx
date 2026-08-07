'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { savePriceTiersAction } from '@/lib/product-actions';

interface TierRow {
  minQtyKg: number;
  pricePerKg: number;
}

/** Compact volume-price-tier editor (add/remove rows) for one product. */
export function TierEditor({ productId, tiers }: { productId: string; tiers: TierRow[] }) {
  const t = useTranslations('products');
  const [rows, setRows] = useState<TierRow[]>(tiers.length ? tiers : [{ minQtyKg: 0, pricePerKg: 0 }]);

  return (
    <details className="text-xs">
      <summary className="cursor-pointer font-semibold text-brand" data-testid={`tiers-${productId}`}>
        {t('tiers')} ({tiers.length})
      </summary>
      <form action={savePriceTiersAction} className="mt-2 space-y-2">
        <input type="hidden" name="productId" value={productId} />
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <input name="minQtyKg" type="number" min="1" defaultValue={r.minQtyKg || ''} placeholder={t('minQty')} className="input !w-24 !py-1 text-xs" />
            <span className="text-muted">kg →</span>
            <input name="pricePerKg" type="number" step="0.01" min="0.01" defaultValue={r.pricePerKg || ''} placeholder={t('pricePerKg')} className="input !w-24 !py-1 text-xs" />
            <button type="button" onClick={() => setRows(rows.filter((_, j) => j !== i))} className="text-red-700" aria-label="remove">
              ×
            </button>
          </div>
        ))}
        <div className="flex gap-2">
          <button type="button" onClick={() => setRows([...rows, { minQtyKg: 0, pricePerKg: 0 }])} className="btn-ghost !py-1 text-xs">
            + {t('addTier')}
          </button>
          <button type="submit" className="btn-primary !py-1 text-xs" data-testid={`save-tiers-${productId}`}>
            {t('saveTiers')}
          </button>
        </div>
      </form>
    </details>
  );
}
