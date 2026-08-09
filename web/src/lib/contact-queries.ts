import { prisma } from '@/lib/db';
import { canBuy, type Role } from '@/lib/rbac';
import { contactTier, redactContact, type ContactTier, type ViewerContext } from '@/lib/contact-visibility';

/**
 * Supplier contact directory reads.
 *
 * **The gate is applied here, in the query, not in the component.** This
 * mirrors the invariant `catalog-queries.ts` already states about only ever
 * returning verified suppliers: the rule lives in one place, so a second caller
 * cannot forget it. What comes back from these functions is already redacted —
 * a page cannot leak a field it was never given.
 */

/**
 * Which of these suppliers the viewer's org has completed a deal with.
 *
 * The batch companion to `hasDealWith` in `social-queries.ts`. Two reasons it
 * exists rather than looping that one:
 *
 *  1. A compare tray or a saved-suppliers list renders many suppliers at once,
 *     and one query per supplier is an N+1 on a page that already runs several.
 *  2. It keeps the answer **per supplier**. The tempting shape — a single
 *     "has this buyer ever transacted" boolean — would unlock every supplier's
 *     direct lines the moment a buyer closed one deal with anyone.
 */
export async function hasDealsWith(viewerOrgId: string | null | undefined, supplierOrgIds: string[]): Promise<Set<string>> {
  if (!viewerOrgId || supplierOrgIds.length === 0) return new Set();
  const deals = await prisma.deal.findMany({
    where: { rfq: { buyerOrgId: viewerOrgId }, quote: { sellerOrgId: { in: supplierOrgIds } } },
    select: { quote: { select: { sellerOrgId: true } } },
  });
  return new Set(deals.map((d) => d.quote.sellerOrgId));
}

export interface Viewer {
  orgId?: string | null;
  role?: Role | null;
  orgStatus?: string | null;
}

function contextFor(viewer: Viewer | null | undefined, hasDeal: boolean): ViewerContext {
  return {
    signedIn: !!viewer?.orgId,
    canBuy: !!viewer?.role && canBuy(viewer.role),
    orgVerified: viewer?.orgStatus === 'verified',
    hasDeal,
  };
}

export type RedactedContact = Partial<Awaited<ReturnType<typeof loadContacts>>[number]> & { id: string };

/**
 * Seniority is a rank, not a word, and sorting the words puts a director above
 * a VP. Prisma cannot express a CASE ordering, and a supplier has a handful of
 * contacts rather than thousands, so the rank is applied after the fetch.
 */
const SENIORITY_RANK: Record<string, number> = {
  c_level: 0,
  vp: 1,
  director: 2,
  manager: 3,
  executive: 4,
};
const rankOf = (s: string | null) => SENIORITY_RANK[s ?? ''] ?? 99;

function loadContacts(orgId: string) {
  return prisma.contact.findMany({
    where: { orgId },
    orderBy: [{ lastName: 'asc' }],
    select: {
      id: true,
      salutation: true,
      firstName: true,
      lastName: true,
      jobTitle: true,
      department: true,
      seniority: true,
      primaryRole: true,
      linkedinUrl: true,
      country: true,
      city: true,
      businessEmail: true,
      territories: true,
      languages: true,
      mobile: true,
      officePhone: true,
      responseHours: true,
      bestContactTime: true,
    },
  });
}

/**
 * One supplier's contacts, already redacted to what this viewer may see, plus
 * the tier itself so the page can explain what is withheld and why. Telling a
 * buyer "complete a transaction to see direct lines" is more useful than
 * silently showing less.
 */
export async function getSupplierContacts(
  supplierOrgId: string,
  viewer: Viewer | null | undefined,
): Promise<{ tier: ContactTier; contacts: RedactedContact[] }> {
  const dealt = await hasDealsWith(viewer?.orgId, [supplierOrgId]);
  const tier = contactTier(contextFor(viewer, dealt.has(supplierOrgId)));
  const rows = await loadContacts(supplierOrgId);
  rows.sort((a, b) => rankOf(a.seniority) - rankOf(b.seniority));
  return { tier, contacts: rows.map((c) => redactContact(c, tier) as RedactedContact) };
}
