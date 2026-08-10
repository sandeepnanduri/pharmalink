import { prisma } from '@/lib/db';
import { certExpiryLevel, needsAttention, summarize } from '@/lib/compliance';

/**
 * A seller org's own credentials, classified by expiry (for renewal alerts).
 *
 * Certificates and regulatory filings are different things — one is a
 * credential the supplier holds, the other a submission someone else references
 * — but they expire the same way and a supplier renewing them wants one list,
 * not two. `certExpiryLevel` and `summarize` are pure and already take
 * `{ expiresAt }[]`, so merging is nearly free.
 *
 * A filing with no expiry (a DMF has none) buckets as `unknown`, never `ok`.
 */
export async function getSellerCompliance(orgId: string) {
  const [certs, filings] = await Promise.all([
    prisma.certification.findMany({
      where: { orgId },
      orderBy: [{ expiresAt: 'asc' }],
      include: { site: { select: { name: true } } },
    }),
    prisma.regulatoryFiling.findMany({
      where: { orgId, status: { not: 'withdrawn' } },
      orderBy: [{ expiresAt: 'asc' }],
    }),
  ]);

  const certRows = certs.map((c) => ({
    id: c.id,
    kind: 'certification' as const,
    name: c.name,
    reference: c.number,
    authority: c.issuingAuthority ?? c.verifiedVia,
    siteName: c.site?.name ?? null,
    status: c.status,
    expiresAt: c.expiresAt,
    level: certExpiryLevel(c.expiresAt),
  }));

  const filingRows = filings.map((f) => ({
    id: f.id,
    kind: 'filing' as const,
    name: f.filingType,
    reference: f.filingNumber,
    authority: f.authority,
    siteName: null,
    status: f.status,
    expiresAt: f.expiresAt,
    level: certExpiryLevel(f.expiresAt),
  }));

  // Soonest first, with the no-expiry rows last: they need attention least and
  // would otherwise sort to the top as nulls.
  const rows = [...certRows, ...filingRows].sort(
    (a, b) => (a.expiresAt?.getTime() ?? Infinity) - (b.expiresAt?.getTime() ?? Infinity),
  );

  return {
    rows,
    summary: summarize(rows),
    alerts: rows.filter((r) => needsAttention(r.level)),
  };
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
