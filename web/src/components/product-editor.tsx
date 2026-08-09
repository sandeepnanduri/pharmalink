'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { saveProductAction, type ActionState } from '@/lib/actions';
import type { SpecGroup } from '@/lib/product-spec';
import { SEGMENTS, segment } from '@/lib/taxonomy';
import { INCOTERMS } from '@/lib/vocab';
import { FieldGroup, GroupNav } from './field-group';
import { ButtonContent } from './spinner';
import { ActionFeedback } from './action-feedback';

/**
 * The full listing editor.
 *
 * Two halves: the commercial core the catalogue queries (name, CAS, segment,
 * price, MOQ, lead time, incoterms — the fields that decide whether this
 * listing is findable at all), then the registry-driven specification sections.
 *
 * The section list is a left rail of anchors, not tabs. Tabs would hide fields
 * behind a click and break find-in-page, which is exactly what a supplier
 * reconciling against a spreadsheet needs.
 */

export interface EditableProduct {
  id: string;
  name: string;
  cas: string;
  productType: string;
  facet: string | null;
  grade: string | null;
  purity: string | null;
  moqKg: number;
  leadTime: string | null;
  priceMin: number | null;
  priceMax: number | null;
  shelfLife: string | null;
  storage: string | null;
  incoterms: string | null;
  packaging: string | null;
  stockStatus: string;
  sampleAvailable: boolean;
  status: string;
}

const STOCK_OPTIONS = [
  { value: 'in_stock', label: 'In stock', labelZh: '有现货' },
  { value: 'made_to_order', label: 'Made to order', labelZh: '按单生产' },
  { value: 'low', label: 'Low stock', labelZh: '库存紧张' },
];

export function ProductEditor({
  product,
  groups,
  values,
  counts,
  canManage,
}: {
  product: EditableProduct;
  groups: SpecGroup[];
  values: Record<string, string>;
  counts: Record<string, { filled: number; total: number }>;
  canManage: boolean;
}) {
  const t = useTranslations('products');
  const tc = useTranslations('catalog');
  const router = useRouter();
  const [state, action, pending] = useActionState<ActionState, FormData>(async (prev, fd) => {
    const res = await saveProductAction(prev, fd);
    if (res.ok) router.refresh();
    return res;
  }, {});

  const facetOptions = segment(product.productType)?.facet;

  return (
    <form action={action} className="grid gap-6 lg:grid-cols-[220px_1fr]">
      <input type="hidden" name="id" value={product.id} />
      {/* The segment decides which spec fields the server will even read, so it
          travels with the submission rather than being re-derived. Changing it
          is done from the quick-add form, not here — a segment change would
          strand every spec value that no longer applies. */}
      <input type="hidden" name="productType" value={product.productType} />

      <aside className="hidden lg:block">
        <GroupNav groups={groups} counts={counts} />
      </aside>

      <div className="min-w-0 space-y-6">
        <section id="group-core" className="card scroll-mt-24" data-testid="field-group-core">
          <h2 className="mb-3 text-sm font-bold text-ink">{t('coreDetails')}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label" htmlFor="e-name">{t('name')}</label>
              <input id="e-name" name="name" required defaultValue={product.name} className="input" data-testid="edit-name" />
            </div>
            <div>
              <label className="label" htmlFor="e-cas">CAS</label>
              <input id="e-cas" name="cas" required defaultValue={product.cas} className="input font-mono" data-testid="edit-cas" />
            </div>
            <div>
              <label className="label" htmlFor="e-segment">{tc('segment')}</label>
              <input
                id="e-segment"
                readOnly
                disabled
                value={SEGMENTS.find((s) => s.type === product.productType)?.label ?? product.productType}
                className="input bg-mist"
              />
            </div>
            {facetOptions && (
              <div>
                <label className="label" htmlFor="e-facet">{facetOptions.label}</label>
                <select id="e-facet" name="facet" defaultValue={product.facet ?? ''} className="input" data-testid="edit-facet">
                  <option value="">—</option>
                  {facetOptions.options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="label" htmlFor="e-grade">{tc('grade')}</label>
              <input id="e-grade" name="grade" defaultValue={product.grade ?? ''} className="input" placeholder="IP / BP / USP" />
            </div>
            <div>
              <label className="label" htmlFor="e-purity">{tc('purity')}</label>
              <input id="e-purity" name="purity" defaultValue={product.purity ?? ''} className="input" placeholder="≥99.5% (USP 2024)" />
            </div>
            <div>
              <label className="label" htmlFor="e-moq">{tc('moq')}</label>
              <input id="e-moq" name="moqKg" type="number" min="1" defaultValue={product.moqKg} className="input" />
            </div>
            <div>
              <label className="label" htmlFor="e-lead">{tc('leadTime')}</label>
              {/* Free text, because that is how a supplier thinks about it. The
                  numeric twin the catalogue sorts on is derived server-side. */}
              <input id="e-lead" name="leadTime" defaultValue={product.leadTime ?? ''} className="input" placeholder="2–3 weeks" data-testid="edit-lead-time" />
            </div>
            <div>
              <label className="label" htmlFor="e-min">{t('priceMin')}</label>
              <input id="e-min" name="priceMin" type="number" step="0.01" defaultValue={product.priceMin ?? ''} className="input" />
            </div>
            <div>
              <label className="label" htmlFor="e-max">{t('priceMax')}</label>
              <input id="e-max" name="priceMax" type="number" step="0.01" defaultValue={product.priceMax ?? ''} className="input" />
            </div>
            <div>
              <label className="label" htmlFor="e-incoterms">{t('incoterms')}</label>
              <input
                id="e-incoterms"
                name="incoterms"
                defaultValue={product.incoterms ?? ''}
                className="input"
                placeholder={INCOTERMS.slice(0, 4).join(', ')}
                data-testid="edit-incoterms"
              />
            </div>
            <div>
              <label className="label" htmlFor="e-stock">{t('stockStatus')}</label>
              <select id="e-stock" name="stockStatus" defaultValue={product.stockStatus} className="input">
                {STOCK_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="e-packaging">{t('packaging')}</label>
              <input id="e-packaging" name="packaging" defaultValue={product.packaging ?? ''} className="input" placeholder="25 kg HDPE drum" />
            </div>
            <div>
              <label className="label" htmlFor="e-shelf">{t('shelfLife')}</label>
              <input id="e-shelf" name="shelfLife" defaultValue={product.shelfLife ?? ''} className="input" />
            </div>
            <div>
              <label className="label" htmlFor="e-storage">{t('storage')}</label>
              <input id="e-storage" name="storage" defaultValue={product.storage ?? ''} className="input" />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="sampleAvailable" defaultChecked={product.sampleAvailable} className="accent-brand" />
              {t('sampleAvailable')}
            </label>
            <div>
              <label className="label" htmlFor="e-status">{t('status')}</label>
              <select id="e-status" name="status" defaultValue={product.status} className="input">
                <option value="live">live</option>
                <option value="draft">draft</option>
                <option value="unpublished">unpublished</option>
              </select>
            </div>
          </div>
        </section>

        {groups.map((group) => (
          <div key={group.id} className="card">
            <FieldGroup group={group} values={values} />
          </div>
        ))}

        {/* Sticky, because the form is long enough that a save button at the
            bottom is a scroll away from most of the fields being edited. */}
        <div className="sticky bottom-0 -mx-4 flex items-center gap-3 border-t border-line bg-paper/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-card sm:border sm:px-4">
          <button type="submit" disabled={pending || !canManage} className="btn-primary" data-testid="editor-save">
            <ButtonContent pending={pending} label={t('save')} />
          </button>
          <ActionFeedback state={state} success={t('saved')} successDescription={t('savedDescription')} />
        </div>
      </div>
    </form>
  );
}
