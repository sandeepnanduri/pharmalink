import { prisma } from '@/lib/db';
import { certExpiryLevel, needsAttention, summarize } from '@/lib/compliance';

/** A seller org's own certifications, classified by expiry (for renewal alerts). */
export async function getSellerCompliance(orgId: string) {
  const certs = await prisma.certification.findMany({
    where: { orgId },
    orderBy: [{ expiresAt: 'asc' }],
    include: { site: { select: { name: true } } },
  });
  const rows = certs.map((c) => ({ ...c, level: certExpiryLevel(c.expiresAt) }));
  return { rows, summary: summarize(certs), alerts: rows.filter((r) => needsAttention(r.level)) };
}

/**
 * For a buyer org: the verified certifications of every supplier they've
 * shortlisted OR done a deal with — with expiry classification, so a buyer can
 * see at a glance which of their suppliers has a cert lapsing.
 */
export async function getBuyerCompliance(orgId: string) {
  const [saved, deals] = await Promise.all([
    prisma.savedSupplier.findMany({ where: { orgId }, select: { supplierOrgId: true } }),
    prisma.deal.findMany({ where: { rfq: { buyerOrgId: orgId } }, select: { quote: { select: { sellerOrgId: true } } } }),
  ]);
  const supplierIds = Array.from(
    new Set([...saved.map((s) => s.supplierOrgId), ...deals.map((d) => d.quote.sellerOrgId)]),
  );
  if (supplierIds.length === 0) return { rows: [], summary: summarize([]), alerts: [], supplierCount: 0 };

  const certs = await prisma.certification.findMany({
    where: { orgId: { in: supplierIds }, status: 'verified' },
    orderBy: [{ expiresAt: 'asc' }],
    include: { org: { select: { id: true, name: true } } },
  });
  const rows = certs.map((c) => ({ ...c, level: certExpiryLevel(c.expiresAt) }));
  return {
    rows,
    summary: summarize(certs),
    alerts: rows.filter((r) => needsAttention(r.level)),
    supplierCount: supplierIds.length,
  };
}
