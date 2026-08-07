import { prisma } from '@/lib/db';
import { performanceReport, summariseRegulatory, type PerformanceReport, type RegulatorySummary } from '@/lib/performance';

/**
 * Supplier profile data — the three sections the buyer-side review called the
 * most commercially critical gaps: does this supplier actually deliver, what
 * terms do they trade on, and is there an open regulatory action.
 *
 * Everything here is computed from platform records or ingested feeds. Nothing
 * is supplier-asserted except where the field name says so, because the whole
 * point of these panels is to check the claims made elsewhere on the profile.
 */

export interface SupplierProfileExtras {
  performance: PerformanceReport;
  regulatory: {
    summary: RegulatorySummary;
    actions: {
      id: string;
      kind: string;
      status: string;
      reference: string | null;
      site: string | null;
      summary: string | null;
      issuedAt: Date;
      closedAt: Date | null;
      sourceName: string;
      sourceUrl: string | null;
    }[];
  };
  commercial: {
    incoterms: string[];
    paymentTerms: string | null;
    leadTime: string | null;
    /** Distinct incoterms actually used on closed deals — what they really do. */
    observedIncoterms: string[];
    sampleProducts: number;
    minMoqKg: number | null;
    coldChain: string[];
  };
}

export async function getSupplierExtras(orgId: string): Promise<SupplierProfileExtras> {
  const [org, deals, quotes, broadcasts, products, actions, shipments] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: orgId },
      select: { createdAt: true, defaultIncoterm: true, defaultPaymentTerms: true, defaultLeadTime: true },
    }),
    prisma.deal.findMany({
      where: { quote: { sellerOrgId: orgId } },
      select: { id: true, totalValue: true, createdAt: true, rfq: { select: { buyerOrgId: true } }, quote: { select: { incoterm: true } } },
    }),
    prisma.quote.findMany({ where: { sellerOrgId: orgId }, select: { id: true, status: true, createdAt: true, rfqId: true } }),
    prisma.rfqSupplier.findMany({ where: { orgId }, select: { rfqId: true, notifiedAt: true, declinedAt: true } }),
    prisma.product.findMany({ where: { orgId, status: 'live' }, select: { moqKg: true, sampleAvailable: true, incoterms: true, coldChain: true } }),
    prisma.regulatoryAction.findMany({ where: { orgId }, orderBy: { issuedAt: 'desc' } }),
    prisma.shipment.findMany({
      where: { deal: { quote: { sellerOrgId: orgId } } },
      select: { deliveredAt: true, eta: true, status: true },
    }),
  ]);

  // On-time is only judgeable where BOTH an ETA and a delivery exist. A shipment
  // still in transit is neither on time nor late, and counting it either way
  // would bias the rate.
  const judgeable = shipments.filter((s) => s.deliveredAt && s.eta);
  const onTime = judgeable.filter((s) => s.deliveredAt! <= s.eta!).length;

  // A response is any quote OR an explicit decline — declining fast is a
  // response, and treating it as silence punishes honest suppliers.
  const answeredRfqs = new Set<string>([...quotes.map((q) => q.rfqId), ...broadcasts.filter((b) => b.declinedAt).map((b) => b.rfqId)]);
  const answeredWithinSla = broadcasts.filter((b) => {
    const q = quotes.find((x) => x.rfqId === b.rfqId);
    const respondedAt = q?.createdAt ?? b.declinedAt;
    return respondedAt != null && respondedAt.getTime() - b.notifiedAt.getTime() <= 24 * 3600 * 1000;
  }).length;

  const buyers = new Map<string, number>();
  for (const d of deals) buyers.set(d.rfq.buyerOrgId, (buyers.get(d.rfq.buyerOrgId) ?? 0) + 1);

  const performance = performanceReport({
    ordersCompleted: judgeable.length,
    ordersOnTime: onTime,
    inquiriesReceived: broadcasts.length,
    inquiriesAnswered: answeredRfqs.size,
    answeredWithinSla,
    quotesSubmitted: quotes.length,
    quotesWon: quotes.filter((q) => q.status === 'accepted').length,
    // Disputes are not modelled yet; reported as no data rather than as zero,
    // which would read as a perfect record the platform cannot vouch for.
    disputes: 0,
    distinctBuyers: buyers.size,
    repeatBuyers: [...buyers.values()].filter((n) => n > 1).length,
    totalValue: deals.reduce((a, d) => a + d.totalValue, 0),
    joinedAt: org?.createdAt ?? null,
  });

  const declared = (org?.defaultIncoterm ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const fromProducts = products.flatMap((p) => (p.incoterms ?? '').split(',').map((s) => s.trim()).filter(Boolean));

  return {
    performance,
    regulatory: {
      summary: summariseRegulatory(actions.map((a) => ({ kind: a.kind as never, status: a.status, issuedAt: a.issuedAt }))),
      actions,
    },
    commercial: {
      incoterms: [...new Set([...declared, ...fromProducts])].sort(),
      paymentTerms: org?.defaultPaymentTerms ?? null,
      leadTime: org?.defaultLeadTime ?? null,
      observedIncoterms: [...new Set(deals.map((d) => d.quote.incoterm).filter(Boolean))].sort(),
      sampleProducts: products.filter((p) => p.sampleAvailable).length,
      minMoqKg: products.length ? Math.min(...products.map((p) => p.moqKg)) : null,
      coldChain: [...new Set(products.map((p) => p.coldChain).filter((c): c is string => Boolean(c)))].sort(),
    },
  };
}
