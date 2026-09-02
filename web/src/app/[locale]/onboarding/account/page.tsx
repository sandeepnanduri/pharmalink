import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireUser } from '@/lib/session';
import { redirect } from '@/i18n/routing';
import { landingFor } from '@/lib/rbac';
import { AccountSetupForm } from '@/components/account-setup-form';

export const dynamic = 'force-dynamic';

/**
 * Account setup for users who arrived via SSO.
 *
 * Uses requireUser (NOT requireRole) on purpose: requireRole redirects org-less
 * users here, so guarding with it would loop. Anyone who already has an
 * organization is sent on to their normal landing page.
 */
export default async function AccountSetupPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ role?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale);
  if (user.orgId) redirect({ href: landingFor(user), locale });

  const t = await getTranslations('accountSetup');
  // Role chosen on the signup page and carried through the OAuth round-trip.
  const requested = (await searchParams).role;
  const initialRole =
    requested === 'seller' || requested === 'both' || requested === 'partner' ? requested : 'buyer';

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:py-12">
      <p className="text-xs font-bold uppercase tracking-wider text-brand">{t('eyebrow')}</p>
      <h1 className="mt-1 text-2xl font-extrabold sm:text-3xl">{t('title')}</h1>
      <p className="mt-1 text-sm text-muted">{t('subtitle')}</p>
      <AccountSetupForm email={user.email} fullName={user.name ?? null} initialRole={initialRole} />
    </div>
  );
}
