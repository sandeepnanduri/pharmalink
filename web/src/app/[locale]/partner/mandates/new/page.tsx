import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireRole } from '@/lib/session';
import { can } from '@/lib/rbac';
import { VerificationBanner } from '@/components/verification-banner';
import { RfqWizard } from '@/components/rfq-wizard';
import { getActiveRepresentations } from '@/lib/partner-queries';
import { prisma } from '@/lib/db';
import { Link } from '@/i18n/routing';

// Renders per-user data (session, representations) — must never be served
// from the static/full route cache.
export const dynamic = 'force-dynamic';

export default async function NewMandatePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ for?: string }>;
}) {
  const { locale } = await params;
  const { for: forOrgId } = await searchParams;
  setRequestLocale(locale);
  const user = await requireRole(locale, ['partner']);
  const t = await getTranslations('partnerMandate');

  const org = user.orgId
    ? await prisma.organization.findUnique({ where: { id: user.orgId }, select: { status: true, rejectedReason: true } })
    : null;
  const allowed = can(user.principal, 'partner:draft');
  const buyers = user.orgId ? (await getActiveRepresentations(user.orgId, 'rfq_draft')).filter((r) => r.orgKind !== 'seller') : [];
  const selected = forOrgId ? buyers.find((b) => b.orgId === forOrgId) : undefined;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-extrabold">{t('newRfqTitle')}</h1>
      <p className="mb-6 mt-1 text-sm text-muted">{t('newRfqSubtitle')}</p>

      <VerificationBanner status={org?.status as never} role={user.role} reason={org?.rejectedReason} />

      {allowed && selected && <RfqWizard locale={locale} actingForOrgId={selected.orgId} actingForOrgName={selected.orgName} />}

      {allowed && !selected && (
        <div className="card">
          <p className="mb-3 text-sm font-bold">{t('pickBuyerTitle')}</p>
          {buyers.length === 0 ? (
            <p className="text-sm text-muted" data-testid="no-buyer-representations">
              {t('noBuyerRepresentations')}
            </p>
          ) : (
            <div className="space-y-2">
              {buyers.map((b) => (
                <Link
                  key={b.representationId}
                  href={{ pathname: '/partner/mandates/new', query: { for: b.orgId } }}
                  className="flex items-center justify-between rounded-panel border border-line px-4 py-3 text-sm font-semibold transition hover:border-violet hover:bg-violet-pale"
                  data-testid={`pick-buyer-${b.orgId}`}
                >
                  {b.orgName}
                  <span className="text-xs font-normal text-muted">{t('draftFor')}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
