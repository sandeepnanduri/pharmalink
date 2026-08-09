'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { saveProductAction, type ActionState } from '@/lib/actions';
import { SEGMENTS, segment } from '@/lib/taxonomy';
import { ButtonContent } from './spinner';
import { ActionFeedback } from '@/components/action-feedback';

export function ProductForm({ label }: { label: string }) {
  const t = useTranslations('products');
  const tc = useTranslations('catalog');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<string>('api');
  const [facet, setFacet] = useState('');
  const facetOptions = segment(type)?.facet;
  const [state, action, pending] = useActionState<ActionState, FormData>(async (prev, fd) => {
    const res = await saveProductAction(prev, fd);
    if (res.ok) {
      setOpen(false);
      router.refresh();
    }
    return res;
  }, {});

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn-primary" data-testid="add-product">
        ＋ {label}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4" role="dialog" aria-modal="true">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6">
            <div className="flex items-start justify-between">
              <h2 className="text-lg font-extrabold">{t('add')}</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="close" className="text-xl text-muted">
                ×
              </button>
            </div>

            <form action={action} className="mt-4 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="label" htmlFor="pname">{t('name')}</label>
                  <input id="pname" name="name" required className="input" data-testid="product-name" />
                </div>
                <div>
                  <label className="label" htmlFor="pcas">CAS</label>
                  <input id="pcas" name="cas" required className="input font-mono" data-testid="product-cas" />
                </div>
                {/* The segment drives the catalogue's filter rail. It used to be
                    absent from this form entirely, so every listing a seller
                    created was filed as an API regardless of what it was. */}
                <div>
                  <label className="label" htmlFor="ptype">{tc('segment')}</label>
                  <select
                    id="ptype"
                    name="productType"
                    className="input"
                    value={type}
                    onChange={(e) => {
                      setType(e.target.value);
                      setFacet(''); // a facet from the old segment would be invalid
                    }}
                    data-testid="product-type"
                  >
                    {SEGMENTS.map((s) => (
                      <option key={s.type} value={s.type}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
                {/* Only three of the seven segments have a facet, so this field
                    appears and disappears rather than offering a meaningless
                    dropdown for a KSM. */}
                {facetOptions ? (
                  <div>
                    <label className="label" htmlFor="pfacet">{facetOptions.label}</label>
                    <select
                      id="pfacet"
                      name="facet"
                      className="input"
                      value={facet}
                      onChange={(e) => setFacet(e.target.value)}
                      data-testid="product-facet"
                    >
                      <option value="">—</option>
                      {facetOptions.options.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div aria-hidden />
                )}
                <div>
                  <label className="label" htmlFor="pgrade">{tc('grade')}</label>
                  <input id="pgrade" name="grade" className="input" placeholder="IP / BP / USP" />
                </div>
                <div>
                  <label className="label" htmlFor="ppurity">{tc('purity')}</label>
                  <input id="ppurity" name="purity" className="input" placeholder="99.5%" />
                </div>
                <div>
                  <label className="label" htmlFor="pmoq">{tc('moq')} (kg)</label>
                  <input id="pmoq" name="moqKg" type="number" min="1" defaultValue={25} className="input" />
                </div>
                <div>
                  <label className="label" htmlFor="plead">{tc('leadTime')}</label>
                  <input id="plead" name="leadTime" className="input" placeholder="2–3 weeks" />
                </div>
                <div>
                  <label className="label" htmlFor="pmin">{t('priceMin')}</label>
                  <input id="pmin" name="priceMin" type="number" step="0.01" className="input" />
                </div>
                <div>
                  <label className="label" htmlFor="pmax">{t('priceMax')}</label>
                  <input id="pmax" name="priceMax" type="number" step="0.01" className="input" />
                </div>
                <div>
                  <label className="label" htmlFor="pformula">{t('formula')}</label>
                  <input id="pformula" name="formula" className="input font-mono" placeholder="C8H9NO2" />
                </div>
                <div>
                  <label className="label" htmlFor="pdmf">{t('dmfNumber')}</label>
                  <input id="pdmf" name="dmfNumber" className="input" placeholder="US DMF 12345" />
                </div>
                <div>
                  <label className="label" htmlFor="pshelf">{t('shelfLife')}</label>
                  <input id="pshelf" name="shelfLife" className="input" placeholder="24 months" />
                </div>
                <div>
                  <label className="label" htmlFor="pstorage">{t('storage')}</label>
                  <input id="pstorage" name="storage" className="input" placeholder="Below 25°C" />
                </div>
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <input type="checkbox" name="sampleAvailable" className="accent-brand" data-testid="product-sample" />
                  {t('sampleAvailable')}
                </label>
                <div className="sm:col-span-2">
                  <label className="label" htmlFor="pstatus">{t('status')}</label>
                  <select id="pstatus" name="status" className="input" defaultValue="live">
                    <option value="live">live</option>
                    <option value="draft">draft</option>
                  </select>
                </div>
              </div>

              {state.error && (
                <p role="alert" className="rounded-lg bg-danger-pale px-3 py-2 text-xs font-semibold text-red-700">
                  {state.error}
                </p>
              )}

              <button type="submit" disabled={pending} className="btn-primary w-full" data-testid="product-save">
                <ButtonContent pending={pending} label={t('add')} />
              </button>
                  {/* Confirms the outcome — without it a silent re-render reads as "nothing happened" and users press submit again. */}
      <ActionFeedback state={state} success="Listing saved" successDescription="Buyers with a matching saved search will be notified of price changes." />
</form>
          </div>
        </div>
      )}
    </>
  );
}
