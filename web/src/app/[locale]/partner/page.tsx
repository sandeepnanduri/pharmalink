import { getTranslations, setRequestLocale } from 'next-intl/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/session';
import { VerificationBanner } from '@/components/verification-banner';
import { StatCard } from '@/components/stat-card';
import { getPortfolio } from '@/lib/partner-queries';
import { Link } from '@/i18n/routing';

// Renders per-user data (session, representations, payouts) — must never be
// served from the static/full route cache.
export const dynamic = 'force-dynamic';

const BUCKETS = ['sourcing', 'quoted', 'awarded'] as const;
const BUCKET_DOT: Record<(typeof BUCKETS)[number], string> = {
  sourcing: 'bg-muted',
  quoted: 'bg-accent',
  awarded: 'bg-ok',
};

export default async function PartnerDashboard({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireRole(locale, ['partner']);
  const t = await getTranslations('partnerDash');

  const org = user.orgId
    ? await prisma.organization.findUnique({ where: { id: user.orgId }, select: { status: true, rejectedReason: true } })
    : null;
  const portfolio = user.orgId ? await getPortfolio(user.orgId) : null;

  if (!portfolio) {
    // Verified as a User (role:'partner') but the Partner satellite row
    // doesn't exist yet — onboarding was interrupted. Send them back.
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <VerificationBanner status={org?.status as never} role={user.role} reason={org?.rejectedReason} />
        <div className="card py-12 text-center text-sm text-muted">{t('noPartnerRecord')}</div>
      </div>
    );
  }

  const grouped = Object.fromEntries(BUCKETS.map((b) => [b, portfolio.mandates.filter((m) => m.bucket === b)])) as Record<
    (typeof BUCKETS)[number],
    typeof portfolio.mandates
  >;
  const priority = portfolio.certAlerts.slice(0, 3);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <h1 className="mb-1 text-2xl font-extrabold">{t('welcome')}</h1>
      <p className="mb-6 text-sm text-muted">{t('subtitle')}</p>

      <VerificationBanner status={org?.status as never} role={user.role} reason={org?.rejectedReason} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label={t('openMandates')} value={portfolio.openMandates} testId="stat-open-mandates" />
        <StatCard label={t('quotesPending')} value={portfolio.quotesPending} testId="stat-quotes-pending" />
        <StatCard label={t('dealsClosed')} value={portfolio.dealsClosedThisMonth} testId="stat-deals-closed" />
        <StatCard label={t('gmvRepresented')} value={`$${Math.round(portfolio.gmvRepresented).toLocaleString()}`} hint={t('informationalOnly')} testId="stat-gmv" />
        <div className="card border-violet-pale bg-gradient-to-b from-white to-violet-pale/40 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-deep">{t('earningsToDate')}</p>
          <p className="mt-1.5 font-display text-3xl font-extrabold tabular-nums text-violet-deep">
            ${Math.round(portfolio.earningsToDate).toLocaleString()}
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_340px]">
        <section className="card">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-bold">{t('pipelineTitle')}</h2>
            <span className="text-xs text-muted">{t('pipelineCount', { count: portfolio.mandates.length })}</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {BUCKETS.map((b) => (
              <div key={b}>
                <div className="mb-2.5 flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${BUCKET_DOT[b]}`} />
                  <span className="text-[11px] font-bold uppercase tracking-wide text-slate2">
                    {t(b)} · {grouped[b].length}
                  </span>
                </div>
                <div className="space-y-2">
                  {grouped[b].length === 0 && <p className="text-xs text-muted">{t('bucketEmpty')}</p>}
                  {grouped[b].map((m) => (
                    <div key={`${m.kind}-${m.id}`} className="rounded-panel border border-line bg-mist p-3" data-testid="mandate-card">
                      <p className="text-[12.5px] font-bold">{m.productName}</p>
                      <p className="mt-0.5 text-[11.5px] text-slate2">
                        {t(m.kind === 'rfq' ? 'actingForBuyer' : 'actingForSupplier', { org: m.principalOrgName })}
                      </p>
                      <p className="mt-1.5 font-mono text-[10.5px] text-muted">{m.reference}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="flex flex-col gap-5">
          <section className="card">
            <h2 className="text-[13.5px] font-bold">{t('priorityTitle')}</h2>
            <p className="mb-3 mt-0.5 text-[11px] text-muted">{t('priorityHint')}</p>
            {priority.length === 0 ? (
              <p className="text-xs text-muted">{t('priorityEmpty')}</p>
            ) : (
              <div className="space-y-2.5">
                {priority.map((c) => (
                  <div key={c.id} className="flex items-start gap-2.5">
                    <span className={c.level === 'expired' || c.level === 'critical' ? 'badge-rejected' : 'badge-pending'}>{t('cert')}</span>
                    <p className="text-[12.5px] leading-snug">{t('certAlertLine', { org: c.org.name, name: c.name })}</p>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="card">
            <h2 className="mb-3 text-[13.5px] font-bold">{t('certExpiryTitle')}</h2>
            {portfolio.certAlerts.length === 0 ? (
              <p className="text-xs text-muted">{t('certExpiryEmpty')}</p>
            ) : (
              <div className="space-y-2.5">
                {portfolio.certAlerts.map((c) => (
                  <div key={c.id} className="flex items-center gap-2.5">
                    <span className={c.level === 'expired' || c.level === 'critical' ? 'badge-rejected' : 'badge-pending'}>
                      {c.expiresAt ? new Date(c.expiresAt).toLocaleDateString(locale) : t('cert')}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold">{c.org.name}</p>
                      <p className="text-[10.5px] text-muted">{c.name}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <Link href="/partner/network" className="btn-ghost justify-center text-xs">
            {t('viewNetwork')}
          </Link>
        </div>
      </div>
    </div>
  );
}
