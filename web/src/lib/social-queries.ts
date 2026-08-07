import { prisma } from '@/lib/db';
import { aggregateRating } from '@/lib/reviews';

/** Average rating + count for one supplier (published reviews only). */
export async function getSupplierRating(supplierOrgId: string) {
  const reviews = await prisma.review.findMany({
    where: { supplierOrgId, status: 'published' },
    select: { rating: true },
  });
  return aggregateRating(reviews);
}

/** Batch: ratings for many suppliers at once (for catalog/cards). */
export async function getSupplierRatings(ids: string[]): Promise<Record<string, { average: number; count: number }>> {
  if (ids.length === 0) return {};
  const grouped = await prisma.review.groupBy({
    by: ['supplierOrgId'],
    where: { supplierOrgId: { in: ids }, status: 'published' },
    _avg: { rating: true },
    _count: { rating: true },
  });
  const out: Record<string, { average: number; count: number }> = {};
  for (const g of grouped) {
    out[g.supplierOrgId] = {
      average: g._avg.rating ? Math.round(g._avg.rating * 10) / 10 : 0,
      count: g._count.rating,
    };
  }
  return out;
}

/** Published reviews for a supplier, newest first. */
export async function getSupplierReviews(supplierOrgId: string, limit = 50) {
  return prisma.review.findMany({
    where: { supplierOrgId, status: 'published' },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: { authorOrg: { select: { name: true, country: true } } },
  });
}

/** The review a given org has already written for a supplier (or null). */
export async function getOwnReview(authorOrgId: string | null | undefined, supplierOrgId: string) {
  if (!authorOrgId) return null;
  return prisma.review.findUnique({ where: { supplierOrgId_authorOrgId: { supplierOrgId, authorOrgId } } });
}

/** Whether the author org has a completed deal with the supplier (verified purchase). */
export async function hasDealWith(authorOrgId: string, supplierOrgId: string): Promise<boolean> {
  const deal = await prisma.deal.findFirst({
    where: { rfq: { buyerOrgId: authorOrgId }, quote: { sellerOrgId: supplierOrgId } },
    select: { id: true },
  });
  return !!deal;
}

export async function isSaved(orgId: string | null | undefined, supplierOrgId: string): Promise<boolean> {
  if (!orgId) return false;
  const row = await prisma.savedSupplier.findUnique({ where: { orgId_supplierOrgId: { orgId, supplierOrgId } } });
  return !!row;
}

/** A buyer org's shortlisted suppliers, with rating + product counts. */
export async function getSavedSuppliers(orgId: string) {
  const saved = await prisma.savedSupplier.findMany({
    where: { orgId },
    orderBy: { createdAt: 'desc' },
    include: {
      supplierOrg: {
        select: {
          id: true,
          name: true,
          country: true,
          city: true,
          certifications: { where: { status: 'verified' }, select: { name: true }, take: 3 },
          _count: { select: { products: { where: { status: 'live' } } } },
        },
      },
    },
  });
  const ratings = await getSupplierRatings(saved.map((s) => s.supplierOrgId));
  return saved.map((s) => ({ ...s, rating: ratings[s.supplierOrgId] ?? { average: 0, count: 0 } }));
}

/** Full detail for several suppliers, for the side-by-side compare table. */
export async function getSuppliersForCompare(ids: string[]) {
  const orgs = await prisma.organization.findMany({
    where: { id: { in: ids }, status: 'verified', kind: { in: ['seller', 'both'] } },
    select: {
      id: true,
      name: true,
      country: true,
      city: true,
      exportMarkets: true,
      dmfNumbers: true,
      defaultIncoterm: true,
      defaultPaymentTerms: true,
      defaultLeadTime: true,
      certifications: { where: { status: 'verified' }, select: { name: true } },
      _count: { select: { products: { where: { status: 'live' } }, sites: true } },
    },
  });
  const ratings = await getSupplierRatings(orgs.map((o) => o.id));
  // Preserve the order the ids were requested in.
  return ids
    .map((id) => orgs.find((o) => o.id === id))
    .filter((o): o is NonNullable<typeof o> => !!o)
    .map((o) => ({ ...o, rating: ratings[o.id] ?? { average: 0, count: 0 } }));
}
