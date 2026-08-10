import { setRequestLocale } from 'next-intl/server';
import { requireUser } from '@/lib/session';
import { redirect } from '@/i18n/routing';
import { homeFor, isPlatformRole } from '@/lib/rbac';

/**
 * The ops console gate.
 *
 * The shell itself now lives in `SignedInShell`, which gives every signed-in
 * user the same console chrome — so this layout is only the boundary: every
 * `/admin/*` route requires a platform role. Each page still checks its own
 * specific permission, because `verifier` and `product_admin` are deliberately
 * narrow: the person clearing GMP certificates has no business moderating
 * listings.
 */
export const dynamic = 'force-dynamic';

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale);
  if (!isPlatformRole(user.role)) redirect({ href: homeFor(user.role), locale });
  return <>{children}</>;
}
