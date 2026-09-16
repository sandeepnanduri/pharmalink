'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { grantRepresentationAction, type ActionState } from '@/lib/partner-actions';
import { REPRESENTATION_SCOPES } from '@/lib/partner';
import { ButtonContent } from './spinner';

const GRANT_ERROR_KEY: Record<string, string> = {
  partnerNotFound: 'errorPartnerNotFound',
  scopesRequired: 'errorScopesRequired',
  cannotRepresentSelf: 'errorCannotRepresentSelf',
};

/**
 * Grants a Sourcing Partner (by their code) representation over the caller's
 * own org — the principal-initiated half of N7.8's Partner Hub. Revoking is a
 * plain ActionForm/ActionSubmit (void-returning); this one needs
 * useActionState because a bad code or missing scopes must report back.
 */
export function GrantPartnerForm() {
  const t = useTranslations('partnerHub');
  const router = useRouter();
  const [state, action, pending] = useActionState<ActionState, FormData>(async (prev, fd) => {
    const res = await grantRepresentationAction(prev, fd);
    if (res.ok) router.refresh();
    return res;
  }, {});

  return (
    <form action={action} className="card space-y-4">
      <div>
        <label className="label" htmlFor="partnerCode">
          {t('partnerCode')}
        </label>
        <input id="partnerCode" name="partnerCode" required className="input font-mono" placeholder="PTR-9F3A2B1C" data-testid="grant-partner-code" />
        <p className="mt-1 text-xs text-muted">{t('partnerCodeHint')}</p>
      </div>

      <div>
        <p className="label">{t('scopesTitle')}</p>
        <div className="flex flex-wrap gap-2">
          {REPRESENTATION_SCOPES.map((s) => (
            <label key={s} className="chip cursor-pointer">
              <input type="checkbox" name="scopes" value={s} className="accent-violet" />
              {t(`scope_${s}`)}
            </label>
          ))}
        </div>
      </div>

      {state.error && (
        <p role="alert" className="rounded-lg bg-danger-pale px-3 py-2 text-xs font-semibold text-red-700" data-testid="grant-partner-error">
          {t(GRANT_ERROR_KEY[state.error ?? ''] ?? 'errorGeneric')}
        </p>
      )}

      <button type="submit" disabled={pending} className="btn-violet" data-testid="grant-partner-submit">
        <ButtonContent pending={pending} label={t('grantSubmit')} />
      </button>
    </form>
  );
}
