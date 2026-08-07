'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { SITE_TYPES } from '@/lib/onboarding';
import { FieldLabel } from './form-field';

/**
 * Repeating manufacturing-site rows for the onboarding wizard.
 *
 * Posts through parallel arrays (`siteName[]`, `siteCity[]`, …) which
 * lib/actions.ts zips back into objects — see zipRows there.
 *
 * The address is captured as discrete fields rather than one free-text box
 * because ops has to match the address printed on a GMP certificate against a
 * real, checkable place, and "Halol, GJ" cannot be matched against anything.
 */

type Row = {
  key: number;
  name: string;
  addressLine: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  siteType: string;
  regulatoryId: string;
};

let nextKey = 1;

const blank = (): Row => ({
  key: nextKey++,
  name: '',
  addressLine: '',
  city: '',
  state: '',
  postalCode: '',
  country: '',
  siteType: 'manufacturing',
  regulatoryId: '',
});

export function SiteRows({ required }: { required: boolean }) {
  const t = useTranslations('onboarding');
  const [rows, setRows] = useState<Row[]>([blank()]);

  const update = (key: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <div className="space-y-3">
      {required && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {t('siteRequiredHint')}
        </p>
      )}

      {rows.map((r, i) => (
        <div key={r.key} className="rounded-lg border border-line bg-white p-3" data-testid="site-row">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <FieldLabel htmlFor={`siteName-${r.key}`} required={required && i === 0}>
                {t('siteName')}
              </FieldLabel>
              <input
                id={`siteName-${r.key}`}
                name="siteName"
                value={r.name}
                onChange={(e) => update(r.key, { name: e.target.value })}
                required={required && i === 0}
                aria-required={required && i === 0 ? 'true' : undefined}
                placeholder="Halol Unit II"
                className="input"
                data-testid="site-name"
              />
            </div>
            <div>
              <label className="label">{t('siteType')}</label>
              <select
                name="siteType"
                value={r.siteType}
                onChange={(e) => update(r.key, { siteType: e.target.value })}
                className="input"
              >
                {SITE_TYPES.map((s) => (
                  <option key={s} value={s}>
                    {t(`siteType_${s}`)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">{t('siteRegulatoryId')}</label>
              <input
                name="siteRegulatoryId"
                value={r.regulatoryId}
                onChange={(e) => update(r.key, { regulatoryId: e.target.value })}
                placeholder={t('siteRegulatoryIdHint')}
                className="input"
                data-testid="site-regid"
              />
            </div>

            <div className="sm:col-span-2 lg:col-span-3">
              <label className="label">{t('siteAddress')}</label>
              <input
                name="siteAddressLine"
                value={r.addressLine}
                onChange={(e) => update(r.key, { addressLine: e.target.value })}
                placeholder="Plot 12, GIDC Industrial Estate"
                className="input"
              />
            </div>

            <div>
              <label className="label">{t('siteCity')}</label>
              <input name="siteCity" value={r.city} onChange={(e) => update(r.key, { city: e.target.value })} className="input" />
            </div>
            <div>
              <label className="label">{t('siteState')}</label>
              <input name="siteState" value={r.state} onChange={(e) => update(r.key, { state: e.target.value })} className="input" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">{t('sitePostalCode')}</label>
                <input
                  name="sitePostalCode"
                  value={r.postalCode}
                  onChange={(e) => update(r.key, { postalCode: e.target.value })}
                  className="input"
                />
              </div>
              <div>
                <label className="label">{t('siteCountry')}</label>
                <input
                  name="siteCountry"
                  value={r.country}
                  onChange={(e) => update(r.key, { country: e.target.value })}
                  className="input"
                />
              </div>
            </div>
          </div>

          {rows.length > 1 && (
            <button
              type="button"
              onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
              className="mt-2 text-xs font-semibold text-red-700 hover:underline"
            >
              {t('removeRow')}
            </button>
          )}
        </div>
      ))}

      <button type="button" onClick={() => setRows((rs) => [...rs, blank()])} className="btn-ghost text-xs" data-testid="add-site">
        + {t('addSite')}
      </button>
    </div>
  );
}
