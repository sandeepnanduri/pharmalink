import { cache } from 'react';
import { auth } from '@/auth';
import { redirect } from '@/i18n/routing';
import { parseRole, parseOrgStatus, homeFor, isPlatformRole, ACCOUNT_SETUP_PATH, type Principal, type Role } from '@/lib/rbac';

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  orgId: string | null;
  principal: Principal;
}

/**
 * Current user, or null when signed out.
 *
 * PERF: wrapped in React `cache()` so it is computed ONCE per request.
 * `auth()` runs the jwt callback, which re-reads the user from the DB every time
 * (deliberate — it makes verification changes and deactivation take effect
 * immediately instead of lingering for the token's 7-day life). Without this
 * dedupe, a single page render cost 3 auth passes + 3 user lookups, because the
 * header, the notification bell and the page guard each asked independently.
 */
export const currentUser = cache(async (): Promise<SessionUser | null> => {
  const session = await auth();
  const u = session?.user;
  if (!u?.id) return null;
  const role = parseRole(u.role);
  const orgStatus = parseOrgStatus(u.orgStatus);
  return {
    id: u.id,
    email: u.email ?? '',
    name: u.name ?? null,
    role,
    orgId: u.orgId ?? null,
    principal: { role, orgStatus },
  };
});

/** Require a signed-in user or bounce to login. */
export async function requireUser(locale: string): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect({ href: '/login', locale });
  return user!;
}

/** Require a specific role or bounce home. */
export async function requireRole(locale: string, allowed: Role[]): Promise<SessionUser> {
  const user = await requireUser(locale);
  // No organization yet => account setup is incomplete (the state an SSO sign-up
  // lands in). Every trading surface below needs an org, so finish setup first.
  // Deliberately NOT in requireUser: the setup page itself uses that, and a guard
  // there would redirect to itself forever.
  if (!user.orgId && !isPlatformRole(user.role)) redirect({ href: ACCOUNT_SETUP_PATH, locale });
  const ok = allowed.includes(user.role) || (user.role === 'both' && (allowed.includes('buyer') || allowed.includes('seller')));
  // Send them to their own home rather than the public marketing page.
  if (!ok) redirect({ href: homeFor(user.role), locale });
  return user;
}
