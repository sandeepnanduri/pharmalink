import { prisma } from '@/lib/db';

/** The current buyer org's sample request for a product (or null). */
export async function getOwnSampleRequest(buyerOrgId: string | null | undefined, productId: string) {
  if (!buyerOrgId) return null;
  return prisma.sampleRequest.findUnique({ where: { productId_buyerOrgId: { productId, buyerOrgId } } });
}

/** Sample requests awaiting or handled by a seller org, newest first. */
export async function getSellerSampleRequests(sellerOrgId: string) {
  return prisma.sampleRequest.findMany({
    where: { sellerOrgId },
    orderBy: { createdAt: 'desc' },
    include: { product: { select: { name: true, cas: true } }, buyerOrg: { select: { name: true, country: true } } },
  });
}
