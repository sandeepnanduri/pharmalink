'use client';

import { useActionState, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { registerDealAction, type ActionState } from '@/lib/partner-actions';
import { ButtonContent } from './spinner';
import { ActionFeedback } from '@/components/action-feedback';

interface Represented {
  orgId: string;
  orgName: string;
  orgKind: string;
}

interface OrgResult {
  id: string;
  name: string;
  country: string;
  city: string | null;
}

/**
 * Deal registration (new — not in the original N7 design): a partner claims
 * a prospective buyer↔supplier↔molecule combination before drafting
 * anything, the standard PRM "protect my lead" pattern. Posts to
 * registerDealAction, which reuses the existing Introduction model exactly
 * as-is (rfqId simply omitted).
 */
export function DealRegistrationForm({ represented }: { represented: Represented[] }) {
  const t = useTranslations('partnerNetwork');
  const [repOrgId, setRepOrgId] = useState(represented[0]?.orgId ?? '');
  const repOrg = represented.find((r) => r.orgId === repOrgId);
  const [role, setRole] = useState<'buyer' | 'seller'>(repOrg?.orgKind === 'seller' ? 'seller' : 'buyer');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<OrgResult[]>([]);
  const [counterparty, setCounterparty] = useState<OrgResult | null>(null);
  const [state, action, pending] = useActionState<ActionState, FormData>(async (prev, fd) => registerDealAction(prev, fd), {});

  useEffect(() => {
    if (repOrg?.orgKind === 'buyer') setRole('buyer');
    else if (repOrg?.orgKind === 'seller') setRole('seller');
  }, [repOrg]);

  useEffect(() => {
    const counterpartyKind = role === 'buyer' ? 'seller' : 'buyer';
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const handle = setTimeout(async () => {
      const res = await fetch(`/api/partner/org-search?kind=${counterpartyKind}&q=${encodeURIComponent(query)}`);
      setResults(await res.json());
    }, 250);
    return () => clearTimeout(handle);
  }, [query, role]);

  if (represented.length === 0) return null;

  const buyerOrgId = role === 'buyer' ? repOrgId : counterparty?.id;
  const supplierOrgId = role === 'seller' ? repOrgId : counterparty?.id;

  return (
    <section className="card mt-6" data-testid="deal-registration-form">
      <h2 className="mb-1 text-base font-bold">{t('dealRegTitle')}</h2>
      <p className="mb-4 text-xs text-muted">{t('dealRegHint')}</p>

      <form action={action} className="space-y-3">
        <input type="hidden" name="buyerOrgId" value={buyerOrgId ?? ''} />
        <input type="hidden" name="supplierOrgId" value={supplierOrgId ?? ''} />

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="deal-rep-org">
              {t('dealRegYourOrg')}
            </label>
            <select
              id="deal-rep-org"
              className="input"
              value={repOrgId}
              onChange={(e) => setRepOrgId(e.target.value)}
              data-testid="deal-rep-org"
            >
              {represented.map((r) => (
                <option key={r.orgId} value={r.orgId}>
                  {r.orgName}
                </option>
              ))}
            </select>
            {repOrg?.orgKind === 'both' && (
              <div className="mt-1.5 flex gap-3 text-xs">
                <label className="flex items-center gap-1.5">
                  <input type="radio" name="role" checked={role === 'buyer'} onChange={() => setRole('buyer')} className="accent-violet" />
                  {t('dealRegAsBuyer')}
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="radio" name="role" checked={role === 'seller'} onChange={() => setRole('seller')} className="accent-violet" />
                  {t('dealRegAsSupplier')}
                </label>
              </div>
            )}
          </div>

          <div>
            <label className="label" htmlFor="deal-cas">
              {t('dealRegCas')}
            </label>
            <input id="deal-cas" name="cas" required className="input font-mono" placeholder="103-90-2" />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="deal-counterparty">
            {role === 'buyer' ? t('dealRegSupplierLabel') : t('dealRegBuyerLabel')}
          </label>
          <input
            id="deal-counterparty"
            className="input"
            value={counterparty ? counterparty.name : query}
            onChange={(e) => {
              setCounterparty(null);
              setQuery(e.target.value);
            }}
            placeholder={t('dealRegCounterpartyPlaceholder')}
            data-testid="deal-counterparty-search"
            autoComplete="off"
          />
          {!counterparty && results.length > 0 && (
            <ul className="mt-1.5 max-h-48 overflow-y-auto rounded-panel border border-line bg-white shadow-card">
              {results.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setCounterparty(r);
                      setResults([]);
                    }}
                    className="block w-full px-3 py-2 text-left text-xs hover:bg-mist"
                    data-testid={`deal-counterparty-${r.id}`}
                  >
                    <span className="font-semibold">{r.name}</span>
                    <span className="ml-1.5 text-muted">
                      {r.city ? `${r.city}, ${r.country}` : r.country}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {state.error && (
          <p role="alert" className="rounded-lg bg-danger-pale px-3 py-2 text-xs font-semibold text-red-700">
            {state.error}
          </p>
        )}

        <button type="submit" disabled={pending || !counterparty} className="btn-violet" data-testid="deal-reg-submit">
          <ButtonContent pending={pending} label={t('dealRegSubmit')} />
        </button>
        <ActionFeedback state={state} success={t('dealRegSuccess')} />
      </form>
    </section>
  );
}
