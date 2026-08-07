/**
 * RBAC + verification gates (BACKLOG F0.3, F7.2; ARCHITECTURE.md §6.4).
 *
 * Pure logic — no DB/Next imports — so it is trivially unit-testable.
 *
 * Two independent gates protect every sensitive action:
 *   1. ROLE   — what kind of account this is (buyer/seller/both/admin)
 *   2. STATUS — whether the user's organization is ops-verified
 *
 * Being verified is NOT implied by having a role: an unverified buyer may browse
 * but must not post RFQs, and an unverified seller must never receive them.
 */

/**
 * Trading roles act on behalf of an organization; PLATFORM roles are PharmaLink
 * staff and have no org of their own.
 *
 *   admin         — application admin: everything, including creating staff users
 *   verifier      — verification officer: approves/rejects buyers & suppliers ONLY
 *   product_admin — catalog moderator: holds/unpublishes listings ONLY
 *
 * Staff roles are deliberately narrow: the person clearing GMP certificates has
 * no business creating other admins, and the catalog moderator has no business
 * verifying companies.
 */
export const ROLES = ['buyer', 'seller', 'both', 'admin', 'verifier', 'product_admin'] as const;
export type Role = (typeof ROLES)[number];

/** Roles belonging to PharmaLink staff rather than a trading organization. */
export const PLATFORM_ROLES: readonly Role[] = ['admin', 'verifier', 'product_admin'];

export function isPlatformRole(role: Role): boolean {
  return PLATFORM_ROLES.includes(role);
}

export const ORG_STATUSES = ['draft', 'pending', 'verified', 'rejected'] as const;
export type OrgStatus = (typeof ORG_STATUSES)[number];

export const PERMISSIONS = [
  'catalog:read', // browse public catalog
  'rfq:create', // post an RFQ            (buyer, verified)
  'rfq:read:own', // view own RFQs
  'quote:create', // submit a quote         (seller, verified)
  'quote:accept', // accept a quote         (buyer, verified)
  'product:manage', // CRUD own listings      (seller, verified)
  'admin:verify', // approve/reject orgs + docs      (admin, verifier)
  'admin:moderate', // hold/unpublish any listing     (admin, product_admin)
  'admin:users', // create staff, assign roles      (admin ONLY)
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export interface Principal {
  role: Role;
  orgStatus: OrgStatus | null;
}

/**
 * Boundary parsers. The database stores role/status as plain strings (SQLite has
 * no enums, and Postgres portability is a goal), so anything read from the DB is
 * validated here rather than cast. Unknown values fail *closed*: an unrecognised
 * role degrades to the least-privileged one, and an unrecognised status is not
 * "verified".
 */
export function parseRole(value: string | null | undefined): Role {
  return (ROLES as readonly string[]).includes(value ?? '') ? (value as Role) : 'buyer';
}

export function parseOrgStatus(value: string | null | undefined): OrgStatus | null {
  return (ORG_STATUSES as readonly string[]).includes(value ?? '') ? (value as OrgStatus) : null;
}

/** Permissions granted by role alone, before the verification gate. */
const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  buyer: ['catalog:read', 'rfq:create', 'rfq:read:own', 'quote:accept'],
  seller: ['catalog:read', 'quote:create', 'product:manage'],
  both: ['catalog:read', 'rfq:create', 'rfq:read:own', 'quote:accept', 'quote:create', 'product:manage'],
  // Platform staff — least privilege, not one blanket "admin".
  admin: ['catalog:read', 'admin:verify', 'admin:moderate', 'admin:users'],
  verifier: ['catalog:read', 'admin:verify'],
  product_admin: ['catalog:read', 'admin:moderate'],
};

/** Permissions that additionally require an ops-verified organization. */
const REQUIRES_VERIFIED: ReadonlySet<Permission> = new Set<Permission>([
  'rfq:create',
  'quote:create',
  'quote:accept',
  'product:manage',
]);

export function isVerified(principal: Principal): boolean {
  return principal.orgStatus === 'verified';
}

export function effectivePermissions(principal: Principal): Set<Permission> {
  const granted = ROLE_PERMISSIONS[principal.role] ?? [];
  const verified = isVerified(principal);
  // Platform staff have no organization of their own, so the verification gate
  // does not apply to them.
  const out = granted.filter(
    (p) => isPlatformRole(principal.role) || !REQUIRES_VERIFIED.has(p) || verified
  );
  return new Set(out);
}

export function can(principal: Principal, permission: Permission): boolean {
  return effectivePermissions(principal).has(permission);
}

/** Explains *why* an action is blocked — drives the UI's "pending verification" states. */
export function denialReason(principal: Principal, permission: Permission): string | null {
  if (can(principal, permission)) return null;
  const grantedByRole = (ROLE_PERMISSIONS[principal.role] ?? []).includes(permission);
  if (!grantedByRole) return 'role';
  if (REQUIRES_VERIFIED.has(permission) && !isVerified(principal)) return 'unverified';
  return 'denied';
}

/** True only for the full application admin (can manage staff users). */
export function isAdmin(principal: Principal): boolean {
  return principal.role === 'admin';
}

/** True for any PharmaLink staff account. */
export function isStaff(principal: Principal): boolean {
  return isPlatformRole(principal.role);
}

/**
 * The home of a signed-in user: the first screen of their actual job.
 *
 * Used for the post-login landing, for the "/" redirect, and whenever someone
 * hits a page their role may not open. A signed-in supplier should never be
 * dropped on the public marketing page — that page sells the product to
 * visitors, and showing "Get started free" to an existing customer is noise.
 */
/** The route a user belongs on right after authenticating. */
export const ACCOUNT_SETUP_PATH = '/onboarding/account';

/**
 * Where to send a signed-in user.
 *
 * A trading user with no organization has not finished creating their account —
 * the normal state immediately after an SSO sign-up, which only yields an email
 * and name. Sending them to a dashboard for an org they don't have is a dead end
 * (they can't post an RFQ, and onboarding rejects them), so route them to the
 * account-setup step first. Platform staff legitimately have no org and are
 * unaffected.
 */
export function landingFor(user: { role: Role; orgId: string | null }): string {
  if (!user.orgId && !isPlatformRole(user.role)) return ACCOUNT_SETUP_PATH;
  return homeFor(user.role);
}

export function homeFor(role: Role): string {
  switch (role) {
    case 'seller':
      return '/seller';
    case 'buyer':
    case 'both':
      return '/buyer';
    case 'product_admin':
      return '/admin/products';
    case 'admin':
    case 'verifier':
      return '/admin';
    default:
      return '/';
  }
}

/** @deprecated use homeFor — kept so ops pages read naturally. */
export const opsLanding = homeFor;

/** Staff roles assignable from the user-administration screen. */
export const ASSIGNABLE_STAFF_ROLES: readonly Role[] = ['admin', 'verifier', 'product_admin'];

export function canSell(role: Role): boolean {
  return role === 'seller' || role === 'both';
}

export function canBuy(role: Role): boolean {
  return role === 'buyer' || role === 'both';
}
