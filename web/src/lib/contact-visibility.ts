/**
 * Who may see which parts of a supplier contact — pure, no DB/Next imports.
 *
 * ## The requirement, and the contradiction in it
 *
 * Sheet 9 of the curation template says two things in consecutive sentences:
 *
 *   "Contact data is RESTRICTED — visible only to authenticated buyers who have
 *    completed at least one PharmaLink transaction."
 *   "Business email only (not personal) shown pre-transaction. LinkedIn URL is
 *    always shown."
 *
 * The first sentence says nothing before a transaction; the second describes
 * what is shown before one. Read strictly, the directory would be useless for
 * the discovery it exists to serve — you cannot complete a transaction with a
 * supplier you cannot contact. Read loosely, the restriction means nothing.
 *
 * So three tiers, which satisfy both sentences:
 *
 *   `public`  anyone, including signed out — name, title, department, LinkedIn.
 *             The sheet is explicit that LinkedIn is always shown.
 *   `email`   a verified buyer with no completed deal with THIS supplier —
 *             adds the business email, territories and languages. This is the
 *             "pre-transaction" tier the second sentence describes.
 *   `full`    a verified buyer with a completed deal with THIS supplier — adds
 *             direct lines and response expectations.
 *
 * Personal email is in no tier: it is never imported. See the Contact model.
 *
 * ## The scoping invariant
 *
 * `hasDeal` is per-supplier, never "has this buyer ever transacted". One
 * completed deal with one supplier must not unlock every other supplier's
 * phone book — which is exactly what a global flag would do on a compare or
 * saved-suppliers screen that renders many suppliers at once.
 */

export const CONTACT_TIERS = ['public', 'email', 'full'] as const;
export type ContactTier = (typeof CONTACT_TIERS)[number];

export interface ViewerContext {
  signedIn: boolean;
  /** The viewer's role permits buying — a supplier browsing peers gets nothing extra. */
  canBuy: boolean;
  /** The viewer's own organisation is ops-verified. */
  orgVerified: boolean;
  /** The viewer's org has a completed deal with THIS supplier. Per-supplier. */
  hasDeal: boolean;
}

export function contactTier(v: ViewerContext): ContactTier {
  if (!v.signedIn || !v.canBuy || !v.orgVerified) return 'public';
  return v.hasDeal ? 'full' : 'email';
}

/** Fields released at each tier, cumulatively. The single source for the redaction. */
export const TIER_FIELDS: Record<ContactTier, readonly string[]> = {
  public: ['id', 'salutation', 'firstName', 'lastName', 'jobTitle', 'department', 'seniority', 'primaryRole', 'linkedinUrl', 'country'],
  email: ['businessEmail', 'territories', 'languages', 'city'],
  full: ['mobile', 'officePhone', 'responseHours', 'bestContactTime'],
};

const CUMULATIVE: Record<ContactTier, ReadonlySet<string>> = {
  public: new Set(TIER_FIELDS.public),
  email: new Set([...TIER_FIELDS.public, ...TIER_FIELDS.email]),
  full: new Set([...TIER_FIELDS.public, ...TIER_FIELDS.email, ...TIER_FIELDS.full]),
};

export function fieldsForTier(tier: ContactTier): ReadonlySet<string> {
  return CUMULATIVE[tier];
}

/**
 * Drops every field the tier does not release.
 *
 * Redaction, not hiding: the value never reaches the page, so it cannot leak
 * through view-source, an RSC payload or a copied DOM node. A CSS-hidden
 * secret is not a secret.
 */
export function redactContact<T extends Record<string, unknown>>(contact: T, tier: ContactTier): Partial<T> {
  const allowed = fieldsForTier(tier);
  const out: Partial<T> = {};
  for (const key of Object.keys(contact) as (keyof T & string)[]) {
    if (allowed.has(key)) out[key] = contact[key];
  }
  return out;
}
