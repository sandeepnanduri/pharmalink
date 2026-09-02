import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import type { OrgStatus, Role } from '@/lib/rbac';

/**
 * The user-facing half of the verification gate (lib/rbac.ts). Explains *why*
 * actions are unavailable instead of silently hiding them.
 */
export async function VerificationBanner({
  status,
  role,
  reason,
}: {
  status: OrgStatus | null;
  role: Role;
  reason?: string | null;
}) {
  const t = await getTranslations('verificationBanner');
  if (status === 'verified' || role === 'admin') return null;

  const href = role === 'seller' ? '/onboarding/seller' : role === 'partner' ? '/onboarding/partner' : '/onboarding/buyer';

  const map = {
    draft: { title: t('draftTitle'), body: t('draftBody'), cls: 'border-brand-mid bg-brand-pale text-indigo-900', cta: true },
    pending: { title: t('pendingTitle'), body: t('pendingBody'), cls: 'border-amber-300 bg-warn-pale text-amber-900', cta: false },
    rejected: {
      title: t('rejectedTitle'),
      body: t('rejectedBody', { reason: reason ?? '—' }),
      cls: 'border-red-300 bg-danger-pale text-red-900',
      cta: true,
    },
  } as const;

  const cfg = map[(status ?? 'draft') as keyof typeof map] ?? map.draft;

  return (
    <div className={`mb-6 flex flex-wrap items-center gap-3 rounded-card border px-4 py-3 ${cfg.cls}`} data-testid="verification-banner">
      <div className="flex-1">
        <p className="text-sm font-bold">{cfg.title}</p>
        <p className="mt-0.5 text-xs leading-relaxed">{cfg.body}</p>
      </div>
      {cfg.cta && (
        <Link href={href} className="btn-primary shrink-0 !py-2 text-xs">
          {t('completeOnboarding')}
        </Link>
      )}
    </div>
  );
}
