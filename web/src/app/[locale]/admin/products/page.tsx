import { getTranslations, setRequestLocale } from 'next-intl/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { redirect } from '@/i18n/routing';
import { can, opsLanding } from '@/lib/rbac';
import { moderateProductAction } from '@/lib/actions';
import { StatusBadge } from '@/components/status-badge';
import { StatCard } from '@/components/stat-card';
import { ActionSubmit } from '@/components/action-submit';

export const dynamic = 'force-dynamic';

/** Catalog moderation — the product_admin role's job (and admins). */
export default async function ProductModerationPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const actor = await requireUser(locale);
  if (!can(actor.principal, 'admin:moderate')) redirect({ href: opsLanding(actor.role), locale });

  const t = await getTranslations('moderation');

  const [products, liveCount, controlledCount] = await Promise.all([
    prisma.product.findMany({
      orderBy: [{ controlledSchedule: 'desc' }, { createdAt: 'desc' }],
      take: 60,
      include: { org: { select: { name: true, status: true, country: true } } },
    }),
    prisma.product.count({ where: { status: 'live' } }),
    prisma.product.count({ where: { controlledSchedule: { not: null } } }),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-extrabold">{t('title')}</h1>
      <p className="mb-6 mt-1 max-w-2xl text-sm text-muted">{t('subtitle')}</p>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label={t('listings')} value={products.length} />
        <StatCard label={t('live')} value={liveCount} testId="stat-live" />
        <StatCard label={t('controlled')} value={controlledCount} testId="stat-controlled" />
      </div>

      <div className="mt-6 overflow-x-auto rounded-card border border-line bg-white">
        <table className="w-full min-w-[720px]">
          <thead>
            <tr>
              <th className="th">{t('product')}</th>
              <th className="th">{t('supplier')}</th>
              <th className="th">{t('flag')}</th>
              <th className="th">{t('statusLabel')}</th>
              <th className="th" />
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} data-testid="moderation-row">
                <td className="td">
                  <span className="font-bold">{p.name}</span>
                  <span className="block font-mono text-xs text-muted">CAS {p.cas}</span>
                </td>
                <td className="td">
                  {p.org.name}
                  {p.org.status === 'verified' && <span className="badge-verified ml-1.5">✓</span>}
                  <span className="block text-xs text-muted">{p.org.country}</span>
                </td>
                <td className="td">
                  {p.controlledSchedule ? (
                    <span className="badge-rejected" data-testid={`controlled-${p.id}`}>
                      ⚠ {p.controlledSchedule}
                    </span>
                  ) : (
                    <span className="text-xs text-muted">—</span>
                  )}
                </td>
                <td className="td">
                  <StatusBadge status={p.status} />
                </td>
                <td className="td">
                  {p.controlledSchedule ? (
                    // Scheduled substances can never be published from here —
                    // the jurisdiction-aware policy engine (G13) is Phase 3.
                    <span className="text-xs text-muted" title={t('controlledLocked')} data-testid={`locked-${p.id}`}>
                      🔒 {t('locked')}
                    </span>
                  ) : (
                    <form action={moderateProductAction} className="flex items-center gap-2">
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="moderation" value={p.status === 'live' ? 'hold' : 'publish'} />
                      <input
                        name="reason"
                        placeholder={t('reason')}
                        className="input !w-36 !py-1.5 text-xs"
                        data-testid={`reason-${p.id}`}
                      />
                      {/* A client submit, so the row actually re-renders once
                          the action resolves — see ActionSubmit and
                          HARDENING-PLAN.md 1.8. Holding a listing is
                          destructive to a supplier's visibility, so it is
                          confirmed; publishing is not. */}
                      <ActionSubmit
                        label={p.status === 'live' ? t('hold') : t('publish')}
                        className={
                          p.status === 'live'
                            ? 'whitespace-nowrap rounded-control border border-danger/40 px-2.5 py-1 text-xs font-semibold text-danger transition hover:bg-danger-pale disabled:opacity-50'
                            : 'whitespace-nowrap text-xs font-semibold text-brand hover:underline disabled:opacity-50'
                        }
                        testId={`moderate-${p.id}`}
                        confirm={p.status === 'live' ? t('confirmHold', { name: p.name }) : undefined}
                      />
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
