'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { CredentialCategory } from '@/lib/onboarding';
import { FieldLabel, FieldError } from './form-field';

/**
 * Repeating credential rows for the onboarding wizard.
 *
 * Each row posts through parallel arrays (`credName[]`, `credNumber[]`, …) that
 * lib/actions.ts zips back into objects. Parallel arrays rather than indexed
 * names so a row can be removed without renumbering the ones after it.
 *
 * A licence requires its number: without one there is nothing to check against
 * the issuing authority's register, which is the whole point of collecting it.
 */

export type CredentialOption = { name: string; category: string; authority: string };

type Row = {
  key: number;
  name: string;
  category: CredentialCategory;
  number: string;
  issuingAuthority: string;
  expiresAt: string;
  documentId: string;
};

let nextKey = 1;

function blank(opt?: CredentialOption): Row {
  return {
    key: nextKey++,
    name: opt?.name ?? '',
    category: (opt?.category as CredentialCategory) ?? 'certification',
    number: '',
    issuingAuthority: opt?.authority ?? '',
    expiresAt: '',
    documentId: '',
  };
}

export function CredentialRows({ options }: { options: readonly CredentialOption[] }) {
  const t = useTranslations('onboarding');
  const [rows, setRows] = useState<Row[]>([blank()]);

  const update = (key: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  // Picking a credential pre-fills its category and issuing authority, so the
  // authority arrives spelled one way instead of eleven.
  const pick = (key: number, name: string) => {
    const opt = options.find((o) => o.name === name);
    update(key, {
      name,
      category: (opt?.category as CredentialCategory) ?? 'certification',
      issuingAuthority: opt?.authority ?? '',
    });
  };

  return (
    <div className="space-y-3">
      {rows.map((r) => {
        const needsNumber = r.category === 'licence';
        return (
          <div key={r.key} className="rounded-lg border border-line bg-white p-3" data-testid="credential-row">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="lg:col-span-2">
                <label className="label">{t('credentialName')}</label>
                <select
                  name="credName"
                  value={r.name}
                  onChange={(e) => pick(r.key, e.target.value)}
                  className="input"
                  data-testid="cred-name"
                >
                  <option value="">{t('credentialPick')}</option>
                  {options.map((o) => (
                    <option key={o.name} value={o.name}>
                      {o.name}
                    </option>
                  ))}
                </select>
                {/* Category travels with the row so the server does not have to
                    re-derive it from the name. */}
                <input type="hidden" name="credCategory" value={r.category} />
              </div>

              <div>
                {/* Required only for licences: without the number there is
                    nothing to check against the issuing register. */}
                <FieldLabel htmlFor={`credNumber-${r.key}`} required={needsNumber}>
                  {t('credentialNumber')}
                </FieldLabel>
                <input
                  id={`credNumber-${r.key}`}
                  name="credNumber"
                  value={r.number}
                  onChange={(e) => update(r.key, { number: e.target.value })}
                  required={needsNumber && !!r.name}
                  aria-required={needsNumber ? 'true' : undefined}
                  aria-invalid={needsNumber && !!r.name && !r.number.trim() ? true : undefined}
                  placeholder={needsNumber ? 'MFG/GJ/2019/1183' : ''}
                  className={`input ${needsNumber && !!r.name && !r.number.trim() ? 'input-error' : ''}`}
                  data-testid="cred-number"
                />
                {needsNumber && !!r.name && !r.number.trim() && (
                  <FieldError message={t('issue_licenceNumberRequired')} />
                )}
              </div>

              <div>
                <label className="label">{t('credentialExpires')}</label>
                <input
                  type="date"
                  name="credExpiresAt"
                  value={r.expiresAt}
                  onChange={(e) => update(r.key, { expiresAt: e.target.value })}
                  className="input"
                  data-testid="cred-expires"
                />
              </div>

              <div className="lg:col-span-2">
                <label className="label">{t('credentialAuthority')}</label>
                <input
                  name="credIssuingAuthority"
                  value={r.issuingAuthority}
                  onChange={(e) => update(r.key, { issuingAuthority: e.target.value })}
                  className="input"
                />
              </div>

              <div className="lg:col-span-2">
                <label className="label">{t('credentialDocument')}</label>
                <input
                  name="credDocumentId"
                  value={r.documentId}
                  onChange={(e) => update(r.key, { documentId: e.target.value })}
                  placeholder={t('credentialDocumentHint')}
                  className="input"
                  data-testid="cred-document"
                />
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
        );
      })}

      <button
        type="button"
        onClick={() => setRows((rs) => [...rs, blank()])}
        className="btn-ghost text-xs"
        data-testid="add-credential"
      >
        + {t('addCredential')}
      </button>
    </div>
  );
}
