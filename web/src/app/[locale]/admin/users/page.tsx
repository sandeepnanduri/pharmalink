import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { redirect } from '@/i18n/routing';
import { can, parseRole, isPlatformRole, opsLanding, ASSIGNABLE_STAFF_ROLES } from '@/lib/rbac';
import { setStaffRoleAction, setStaffActiveAction } from '@/lib/actions';
import { StaffForm } from '@/components/staff-form';
import { StatCard } from '@/components/stat-card';

export const dynamic = 'force-dynamic';

export default async function UsersAdminPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const actor = await requireUser(locale);

  // Gate on the PERMISSION, not the role name — a verifier is staff but must
  // never reach user administration.
  if (!can(actor.principal, 'admin:users')) redirect({ href: opsLanding(actor.role), locale });

  const t = await getTranslations('users');
  const format = await getFormatter();

  const [staff, members, adminCount] = await Promise.all([
    prisma.user.findMany({
      where: { role: { in: [...ASSIGNABLE_STAFF_ROLES] } },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, name: true, email: true, role: true, active: true, lastLoginAt: true, createdAt: true },
    }),
    prisma.user.findMany({
      where: { role: { in: ['buyer', 'seller', 'both'] } },
      orderBy: { createdAt: 'desc' },
      take: 25,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        org: { select: { name: true, status: true } },
      },
    }),
    prisma.user.count({ where: { role: 'admin', active: true, deletedAt: null } }),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">{t('title')}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">{t('subtitle')}</p>
        </div>
        <StaffForm label={t('addStaff')} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label={t('staffCount')} value={staff.length} testId="stat-staff" />
        <StatCard label={t('adminCount')} value={adminCount} testId="stat-admins" />
        <StatCard label={t('memberCount')} value={members.length} />
      </div>

      {/* Staff */}
      <h2 className="mb-3 mt-8 text-base font-bold">{t('staff')}</h2>
      <div className="overflow-x-auto rounded-card border border-line bg-white">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr>
              <th className="th">{t('user')}</th>
              <th className="th">{t('role')}</th>
              <th className="th">{t('lastLogin')}</th>
              <th className="th">{t('statusLabel')}</th>
              <th className="th" />
            </tr>
          </thead>
          <tbody>
            {staff.map((u) => {
              const role = parseRole(u.role);
              const isSelf = u.id === actor.id;
              const lastAdmin = role === 'admin' && adminCount <= 1;
              return (
                <tr key={u.id} data-testid="staff-row">
                  <td className="td">
                    <span className="font-bold">{u.name ?? '—'}</span>
                    <span className="block break-all text-xs text-muted">{u.email}</span>
                    {isSelf && <span className="badge-info mt-1">{t('you')}</span>}
                  </td>
                  <td className="td">
                    {/* Role changes go through the server action, which re-checks
                        permission and refuses to demote the last admin. */}
                    <form action={setStaffRoleAction} className="flex items-center gap-2">
                      <input type="hidden" name="userId" value={u.id} />
                      <select
                        name="role"
                        defaultValue={role}
                        disabled={isSelf && lastAdmin}
                        className="input !py-1.5 text-xs"
                        data-testid={`role-select-${u.email}`}
                      >
                        {ASSIGNABLE_STAFF_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {t(`role_${r}`)}
                          </option>
                        ))}
                      </select>
                      <button type="submit" disabled={isSelf && lastAdmin} className="btn-ghost !py-1.5 text-xs">
                        {t('save')}
                      </button>
                    </form>
                  </td>
                  <td className="td text-xs text-muted">
                    {u.lastLoginAt ? format.relativeTime(u.lastLoginAt) : t('never')}
                  </td>
                  <td className="td">
                    {u.active ? <span className="badge-verified">{t('active')}</span> : <span className="badge-rejected">{t('disabled')}</span>}
                  </td>
                  <td className="td">
                    {isSelf || lastAdmin ? (
                      <span className="text-xs text-muted" title={t('cannotDisable')}>
                        —
                      </span>
                    ) : (
                      <form action={setStaffActiveAction}>
                        <input type="hidden" name="userId" value={u.id} />
                        <input type="hidden" name="active" value={String(!u.active)} />
                        <button
                          type="submit"
                          className="text-xs font-semibold text-brand hover:underline"
                          data-testid={`toggle-${u.email}`}
                        >
                          {u.active ? t('disable') : t('enable')}
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Trading accounts — read-only here; their role is tied to their org. */}
      <h2 className="mb-1 mt-8 text-base font-bold">{t('members')}</h2>
      <p className="mb-3 text-xs text-muted">{t('membersHint')}</p>
      <div className="overflow-x-auto rounded-card border border-line bg-white">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr>
              <th className="th">{t('user')}</th>
              <th className="th">{t('organization')}</th>
              <th className="th">{t('role')}</th>
              <th className="th">{t('statusLabel')}</th>
              <th className="th" />
            </tr>
          </thead>
          <tbody>
            {members.map((u) => (
              <tr key={u.id} data-testid="member-row">
                <td className="td">
                  <span className="font-bold">{u.name ?? '—'}</span>
                  <span className="block break-all text-xs text-muted">{u.email}</span>
                </td>
                <td className="td">
                  {u.org?.name ?? '—'}
                  {u.org && (
                    <span className={`ml-1.5 ${u.org.status === 'verified' ? 'badge-verified' : 'badge-pending'}`}>
                      {u.org.status === 'verified' ? '✓' : '●'}
                    </span>
                  )}
                </td>
                <td className="td text-xs">{u.role}</td>
                <td className="td">
                  {u.active ? <span className="badge-verified">{t('active')}</span> : <span className="badge-rejected">{t('disabled')}</span>}
                </td>
                <td className="td">
                  {isPlatformRole(parseRole(u.role)) ? null : (
                    <form action={setStaffActiveAction}>
                      <input type="hidden" name="userId" value={u.id} />
                      <input type="hidden" name="active" value={String(!u.active)} />
                      <button type="submit" className="text-xs font-semibold text-brand hover:underline">
                        {u.active ? t('disable') : t('enable')}
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
