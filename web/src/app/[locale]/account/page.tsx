import { getTranslations, setRequestLocale } from 'next-intl/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { isPlatformRole } from '@/lib/rbac';
import { Link } from '@/i18n/routing';
import { ProfileForm, PasswordForm, CompanyForm, type CompanyValues } from '@/components/account-forms';

// Per-user data — never cached.
export const dynamic = 'force-dynamic';

/** Account settings. Available to EVERY signed-in role. */
export default async function AccountPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale);
  const t = await getTranslations('account');
  const tu = await getTranslations('users');
  const ti = await getTranslations('integrations');
  const tt = await getTranslations('team');

  const db = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      name: true,
      email: true,
      role: true,
      // Never send the hash to the client — only whether one exists.
      passwordHash: true,
      org: true,
    },
  });
  if (!db) return null;

  const org = db.org;
  const values: CompanyValues | null = org
    ? {
        name: org.name,
        regNumber: org.regNumber ?? '',
        city: org.city ?? '',
        country: org.country,
        website: org.website ?? '',
        about: org.about ?? '',
        defaultIncoterm: org.defaultIncoterm ?? '',
        defaultPaymentTerms: org.defaultPaymentTerms ?? '',
        defaultLeadTime: org.defaultLeadTime ?? '',
        exportMarkets: org.exportMarkets ?? '',
        dmfNumbers: org.dmfNumbers ?? '',
        sourcingCategories: org.sourcingCategories ?? '',
        regulatoryMarkets: org.regulatoryMarkets ?? '',
        preferredOrigins: org.preferredOrigins ?? '',
      }
    : null;

  const roleLabel = isPlatformRole(user.role) ? tu(`role_${user.role}`) : t(`role_${user.role}`);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">{t('title')}</h1>
          <p className="mt-1 text-sm text-muted">{t('subtitle')}</p>
        </div>
        {org && (
          <div className="flex shrink-0 flex-wrap gap-2">
            <Link href="/account/team" className="btn-ghost" data-testid="team-link">{tt('title')} →</Link>
            <Link href="/account/integrations" className="btn-ghost" data-testid="integrations-link">{ti('title')} →</Link>
          </div>
        )}
      </div>

      <div className="space-y-5">
        <ProfileForm name={db.name ?? ''} email={db.email} role={roleLabel} />
        <PasswordForm hasPassword={!!db.passwordHash} />
        {/* Staff have no organization — only trading accounts get this section. */}
        {values && org && <CompanyForm values={values} kind={org.kind} locked={org.status === 'verified'} />}
      </div>
    </div>
  );
}
