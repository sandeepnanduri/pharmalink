import { getTranslations, setRequestLocale } from 'next-intl/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/session';
import { can } from '@/lib/rbac';
import { VerificationBanner } from '@/components/verification-banner';
import { RfqWizard } from '@/components/rfq-wizard';

// Renders per-user data (session, org plan, quotas) — must never be served
// from the static/full route cache.
export const dynamic = 'force-dynamic';


export default async function NewRfqPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const user = await requireRole(locale, ['buyer', 'both']);
  const t = await getTranslations('rfq');

  // Arriving from a product page: look the product up SERVER-side from its id
  // rather than trusting name/CAS passed in the URL — a hand-edited query string
  // must not be able to seed an RFQ with a mismatched name and CAS.
  const productId = typeof sp.productId === 'string' ? sp.productId : null;
  const product = productId
    ? await prisma.product.findFirst({
        where: { id: productId, status: 'live', org: { status: 'verified' } },
        select: { name: true, cas: true, grade: true, moqKg: true, org: { select: { name: true } } },
      })
    : null;

  const org = user.orgId
    ? await prisma.organization.findUnique({ where: { id: user.orgId }, select: { status: true, rejectedReason: true } })
    : null;

  const allowed = can(user.principal, 'rfq:create');

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-extrabold">{t('newTitle')}</h1>
      <p className="mb-6 mt-1 text-sm text-muted">{t('newSubtitle')}</p>

      <VerificationBanner status={org?.status as never} role={user.role} reason={org?.rejectedReason} />

      {/* Server-side gate: an unverified buyer cannot post, and the UI says why. */}
      {allowed ? (
        <RfqWizard
          locale={locale}
          initial={
            product
              ? { productName: product.name, cas: product.cas, grade: product.grade, supplier: product.org.name }
              : null
          }
        />
      ) : null}
    </div>
  );
}
