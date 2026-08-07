import { prisma } from '@/lib/db';

const ORDER_INCLUDE = {
  shipment: true,
  rfq: { select: { id: true, reference: true, productName: true, cas: true, quantityKg: true, buyerOrg: { select: { name: true } } } },
  quote: { select: { unitPrice: true, currency: true, leadTime: true, incoterm: true, sellerOrg: { select: { name: true } } } },
} as const;

/** Buyer's orders (deals) with shipment status — newest first. */
export async function getBuyerOrders(orgId: string) {
  return prisma.deal.findMany({ where: { rfq: { buyerOrgId: orgId } }, orderBy: { createdAt: 'desc' }, include: ORDER_INCLUDE });
}

/** Seller's orders (deals they won) with shipment status. */
export async function getSellerOrders(orgId: string) {
  return prisma.deal.findMany({ where: { quote: { sellerOrgId: orgId } }, orderBy: { createdAt: 'desc' }, include: ORDER_INCLUDE });
}

export interface TimelineEvent {
  at: Date;
  key: string;
  detail?: string;
}

/** Derives an RFQ lifecycle timeline from real timestamps (no invented steps). */
export async function getRfqTimeline(rfqId: string): Promise<TimelineEvent[]> {
  const rfq = await prisma.rfq.findUnique({
    where: { id: rfqId },
    select: {
      createdAt: true,
      quotes: { select: { createdAt: true }, orderBy: { createdAt: 'asc' } },
      deal: { select: { createdAt: true, reference: true, shipment: true } },
    },
  });
  if (!rfq) return [];

  const events: TimelineEvent[] = [{ at: rfq.createdAt, key: 'posted' }];
  if (rfq.quotes.length > 0) {
    events.push({ at: rfq.quotes[0].createdAt, key: 'firstQuote' });
    if (rfq.quotes.length > 1) events.push({ at: rfq.quotes[rfq.quotes.length - 1].createdAt, key: 'quotesReceived', detail: String(rfq.quotes.length) });
  }
  if (rfq.deal) {
    events.push({ at: rfq.deal.createdAt, key: 'awarded', detail: rfq.deal.reference });
    const s = rfq.deal.shipment;
    if (s?.shippedAt) events.push({ at: s.shippedAt, key: 'shipped' });
    if (s?.deliveredAt) events.push({ at: s.deliveredAt, key: 'delivered' });
    if (s?.confirmedAt) events.push({ at: s.confirmedAt, key: 'confirmed' });
  }
  return events.sort((a, b) => a.at.getTime() - b.at.getTime());
}

/** Quotes on the seller's RFQs that have an open counter-offer awaiting them. */
export async function getSellerNegotiations(orgId: string) {
  const quotes = await prisma.quote.findMany({
    where: { sellerOrgId: orgId, counters: { some: { status: 'open' } } },
    select: {
      id: true,
      unitPrice: true,
      currency: true,
      rfq: { select: { reference: true, productName: true, quantityKg: true, buyerOrgId: true } },
      counters: { orderBy: { createdAt: 'desc' } },
    },
  });
  // Only those where the newest open counter was proposed by the BUYER (awaiting the seller).
  return quotes
    .map((q) => ({ ...q, active: q.counters.find((c) => c.status === 'open') }))
    .filter((q) => q.active && q.active.byOrgId === q.rfq.buyerOrgId);
}
