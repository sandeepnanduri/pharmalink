'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { inviteTeammateAction, setTeammateActiveAction, type TeamState } from '@/lib/team-actions';
import { ButtonContent } from './spinner';
import { ActionFeedback } from '@/components/action-feedback';

export interface Member {
  id: string;
  email: string;
  name: string | null;
  role: string;
  orgRole: string;
  active: boolean;
}

export function TeamManager({
  members,
  seatsUsed,
  seatsLimit,
  isOwner,
  selfId,
}: {
  members: Member[];
  seatsUsed: number;
  seatsLimit: number | null;
  isOwner: boolean;
  selfId: string;
}) {
  const t = useTranslations('team');
  const router = useRouter();
  const [state, action, pending] = useActionState<TeamState, FormData>(
    async (prev, fd) => {
      const res = await inviteTeammateAction(prev, fd);
      if (res.ok) router.refresh();
      return res;
    },
    {},
  );
  const atLimit = seatsLimit != null && seatsUsed >= seatsLimit;

  return (
    <div className="space-y-8">
      <section className="card">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-bold">{t('members')}</h2>
          <span className="text-xs text-muted" data-testid="seat-usage">
            {t('seats', { used: seatsUsed, limit: seatsLimit ?? '∞' })}
          </span>
        </div>
        <ul className="mt-3 divide-y divide-line">
          {members.map((m) => (
            <li key={m.id} className="flex items-center gap-3 py-2.5" data-testid="member-row">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {m.name ?? m.email}
                  {m.id === selfId && <span className="ml-1 text-xs text-muted">({t('you')})</span>}
                </p>
                <p className="truncate text-xs text-muted">{m.email}</p>
              </div>
              <span className={m.orgRole === 'owner' ? 'badge-verified' : 'badge-neutral'}>{t(`role_${m.orgRole}`)}</span>
              {!m.active && <span className="badge-rejected text-[11px]">{t('inactive')}</span>}
              {isOwner && m.orgRole !== 'owner' && m.id !== selfId && (
                <form action={setTeammateActiveAction}>
                  <input type="hidden" name="userId" value={m.id} />
                  <button type="submit" className="text-xs font-semibold text-red-700 hover:underline" data-testid={`toggle-member-${m.id}`}>
                    {m.active ? t('deactivate') : t('reactivate')}
                  </button>
                      {/* Confirms the outcome — without it a silent re-render reads as "nothing happened" and users press submit again. */}
      <ActionFeedback state={state} success="Team updated" />
</form>
              )}
            </li>
          ))}
        </ul>
      </section>

      {isOwner && (
        <section className="card">
          <h2 className="text-base font-bold">{t('invite')}</h2>
          <p className="mt-1 text-sm text-muted">{t('inviteHint')}</p>
          {atLimit ? (
            <p className="mt-3 rounded-lg border border-amber-300 bg-warn-pale px-3 py-2 text-xs text-amber-900" data-testid="seat-limit">
              {t('seatLimit')}
            </p>
          ) : (
            <form action={action} className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="tm-name">{t('name')}</label>
                <input id="tm-name" name="name" required className="input" data-testid="tm-name" />
              </div>
              <div>
                <label className="label" htmlFor="tm-email">{t('email')}</label>
                <input id="tm-email" name="email" type="email" required className="input" data-testid="tm-email" />
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="tm-pass">{t('tempPassword')}</label>
                <input id="tm-pass" name="password" type="text" required minLength={8} className="input" data-testid="tm-password" />
              </div>
              {state.error && <p className="text-xs font-semibold text-red-700 sm:col-span-2">{t(state.error)}</p>}
              <button type="submit" disabled={pending} className="btn-primary sm:col-span-2" data-testid="tm-invite">
                <ButtonContent pending={pending} label={t('addMember')} />
              </button>
            </form>
          )}
        </section>
      )}
    </div>
  );
}
