'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { createStaffUserAction, type ActionState } from '@/lib/actions';
import { ASSIGNABLE_STAFF_ROLES } from '@/lib/rbac';
import { ButtonContent } from './spinner';
import { ActionFeedback } from '@/components/action-feedback';

/** Create a local staff account (admin / verifier / product_admin). */
export function StaffForm({ label }: { label: string }) {
  const t = useTranslations('users');
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [state, action, pending] = useActionState<ActionState, FormData>(async (prev, fd) => {
    const res = await createStaffUserAction(prev, fd);
    if (res.ok) {
      setOpen(false);
      router.refresh();
    }
    return res;
  }, {});

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn-primary" data-testid="add-staff">
        ＋ {label}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4" role="dialog" aria-modal="true">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6">
            <div className="flex items-start justify-between">
              <h2 className="text-lg font-extrabold">{t('addStaff')}</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="close" className="text-xl text-muted">
                ×
              </button>
            </div>
            <p className="mt-1 text-xs text-muted">{t('addStaffHint')}</p>

            <form action={action} className="mt-4 space-y-4">
              <div>
                <label className="label" htmlFor="sname">{t('name')}</label>
                <input id="sname" name="name" required className="input" data-testid="staff-name" />
              </div>
              <div>
                <label className="label" htmlFor="semail">{t('email')}</label>
                <input id="semail" name="email" type="email" required inputMode="email" className="input" data-testid="staff-email" />
              </div>
              <div>
                <label className="label" htmlFor="spassword">
                  {t('password')} <span className="font-normal text-muted">{t('passwordHint')}</span>
                </label>
                <input
                  id="spassword"
                  name="password"
                  type="password"
                  required
                  minLength={10}
                  autoComplete="new-password"
                  className="input"
                  data-testid="staff-password"
                />
              </div>
              <div>
                <label className="label" htmlFor="srole">{t('role')}</label>
                <select id="srole" name="role" className="input" defaultValue="verifier" data-testid="staff-role">
                  {ASSIGNABLE_STAFF_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {t(`role_${r}`)}
                    </option>
                  ))}
                </select>
                <ul className="mt-2 space-y-1 text-[11px] leading-relaxed text-muted">
                  <li>
                    <b>{t('role_verifier')}</b> — {t('role_verifier_desc')}
                  </li>
                  <li>
                    <b>{t('role_product_admin')}</b> — {t('role_product_admin_desc')}
                  </li>
                  <li>
                    <b>{t('role_admin')}</b> — {t('role_admin_desc')}
                  </li>
                </ul>
              </div>

              {state.error && (
                <p role="alert" data-testid="staff-error" className="rounded-lg bg-danger-pale px-3 py-2 text-xs font-semibold text-red-700">
                  {t(state.error)}
                </p>
              )}

              <button type="submit" disabled={pending} className="btn-primary w-full" data-testid="staff-save">
                <ButtonContent pending={pending} label={t('createStaff')} />
              </button>
                  {/* Confirms the outcome — without it a silent re-render reads as "nothing happened" and users press submit again. */}
      <ActionFeedback state={state} success="Staff account saved" />
</form>
          </div>
        </div>
      )}
    </>
  );
}
