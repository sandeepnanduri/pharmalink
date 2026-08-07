import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { prisma } from '@/lib/db';
import { redirect } from '@/i18n/routing';
import { can, opsLanding } from '@/lib/rbac';
import { requireUser } from '@/lib/session';
import { reviewOrgAction } from '@/lib/actions';
import { StatCard } from '@/components/stat-card';
import { StatusBadge } from '@/components/status-badge';
import { OrgDossier } from '@/components/org-dossier';

// Renders per-user data (session, org plan, quotas) — must never be served
// from the static/full route cache.
export const dynamic = 'force-dynamic';


export default async function AdminPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const actor = await requireUser(locale);
  // Gate on the permission, not the role list — and send a product_admin to the
  // catalog rather than bouncing them through a page they cannot open.
  if (!can(actor.principal, 'admin:verify')) redirect({ href: opsLanding(actor.role), locale });
  const t = await getTranslations('admin');
  const format = await getFormatter();

  const [queue, verifiedCount, pendingCount, rfqCount, dealCount, audits] = await Promise.all([
    prisma.organization.findMany({
      where: { status: 'pending' },
      include: {
        // Deliberately NOT filtered to status:'pending'. A verifier judging an
        // application needs the whole picture — an already-rejected certificate
        // or a previously approved document is exactly the context that changes
        // the decision, and filtering it out hid it.
        documents: { orderBy: { createdAt: 'desc' } },
        certifications: { orderBy: { name: 'asc' } },
        sites: { orderBy: { name: 'asc' } },
        users: {
          where: { deletedAt: null },
          orderBy: [{ orgRole: 'asc' }, { createdAt: 'asc' }],
          select: {
            id: true, name: true, email: true, phone: true, role: true,
            orgRole: true, emailVerified: true, lastLoginAt: true, createdAt: true,
            consentTermsAt: true, consentPrivacyAt: true, consentMarketingAt: true,
          },
        },
      },
      orderBy: { updatedAt: 'asc' },
    }),
    prisma.organization.count({ where: { status: 'verified' } }),
    prisma.organization.count({ where: { status: 'pending' } }),
    prisma.rfq.count(),
    prisma.deal.count(),
    prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 8, include: { actor: { select: { email: true } } } }),
  ]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-extrabold">{t('title')}</h1>
      <p className="mb-6 mt-1 max-w-2xl text-sm text-muted">{t('subtitle')}</p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t('verifiedOrgs')} value={verifiedCount} testId="stat-verified" />
        <StatCard label={t('pendingOrgs')} value={pendingCount} testId="stat-pending" />
        <StatCard label={t('totalRfqs')} value={rfqCount} />
        <StatCard label={t('totalDeals')} value={dealCount} />
      </div>

      <h2 className="mb-3 mt-8 text-base font-bold">{t('queue')}</h2>
      <p className="mb-3 rounded-lg border border-brand-mid bg-brand-pale px-3 py-2 text-xs text-indigo-900">📋 {t('checklist')}</p>

      {queue.length === 0 ? (
        <div className="card py-12 text-center text-sm text-muted" data-testid="empty-queue">
          {t('emptyQueue')}
        </div>
      ) : (
        <ul className="space-y-4">
          {queue.map((org) => (
            <li key={org.id} className="card" data-testid="queue-item">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-bold">{org.name}</h3>
                    <StatusBadge status={org.status} />
                    <span className="badge-neutral">{org.kind}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {org.city}, {org.country} · {org.regNumber ?? '—'} · {t('submitted')}{' '}
                    {/* Relative time is computed against "now", so the server's
                        string and the client's can straddle a rounding boundary
                        ("2 hours ago" vs "3 hours ago") and fail hydration.
                        The drift is the intended behaviour, so suppress it. */}
                    <span suppressHydrationWarning>{format.relativeTime(org.updatedAt)}</span>
                  </p>

                  {/* At-a-glance summary; the dossier below carries the detail. */}
                  <p className="mt-1.5 text-xs text-muted">
                    {t('summaryCounts', {
                      contacts: org.users.length,
                      sites: org.sites.length,
                      certs: org.certifications.length,
                      docs: org.documents.length,
                    })}
                  </p>

                  {org.certifications.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {org.certifications.map((c) => (
                        <span key={c.id} className="chip">
                          🛡️ {c.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex shrink-0 flex-col gap-2">
                  <form action={reviewOrgAction} className="flex items-center gap-2">
                    <input type="hidden" name="orgId" value={org.id} />
                    <input type="hidden" name="decision" value="approve" />
                    <button type="submit" className="btn-primary !py-2 text-xs" data-testid={`approve-${org.id}`}>
                      ✓ {t('approve')}
                    </button>
                  </form>
                  <form action={reviewOrgAction} className="flex items-center gap-2">
                    <input type="hidden" name="orgId" value={org.id} />
                    <input type="hidden" name="decision" value="reject" />
                    <input
                      name="reason"
                      required
                      placeholder={t('reasonLabel')}
                      className="input !py-1.5 text-xs"
                      data-testid={`reason-${org.id}`}
                    />
                    <button type="submit" className="btn-ghost !py-2 text-xs !text-red-700" data-testid={`reject-${org.id}`}>
                      {t('reject')}
                    </button>
                  </form>
                </div>
              </div>

              {/* Everything the applicant submitted, so the decision is made on
                  the full record rather than on the card summary above. */}
              <OrgDossier org={org} />
            </li>
          ))}
        </ul>
      )}

      <h2 className="mb-3 mt-8 text-base font-bold">{t('auditTrail')}</h2>
      <div className="overflow-x-auto rounded-card border border-line bg-white">
        <table className="w-full">
          <thead>
            <tr>
              <th className="th">Action</th>
              <th className="th">Entity</th>
              <th className="th">Actor</th>
              <th className="th">Reason</th>
              <th className="th">When</th>
            </tr>
          </thead>
          <tbody>
            {audits.map((a) => (
              <tr key={a.id}>
                <td className="td font-mono text-xs font-bold text-brand">{a.action}</td>
                <td className="td text-xs">{a.entity}</td>
                <td className="td text-xs text-muted">{a.actor?.email ?? '—'}</td>
                <td className="td text-xs text-muted">{a.reason ?? '—'}</td>
                <td className="td text-xs text-muted" suppressHydrationWarning>
                  {format.relativeTime(a.createdAt)}
                </td>
              </tr>
            ))}
            {audits.length === 0 && (
              <tr>
                <td className="td text-sm text-muted" colSpan={5}>
                  —
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
