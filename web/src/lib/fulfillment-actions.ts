'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { currentUser } from '@/lib/session';
import { cleanText } from '@/lib/sanitize';
import { canSellerSet, canBuyerConfirm } from '@/lib/shipment';
import { validCounter, activeCounter, canRespond, canPropose } from '@/lib/negotiation';

export type FulfillmentState = { error?: string; ok?: boolean };

async function audit(action: string, entity: string, entityId: string, actorId?: string) {
  await prisma.auditLog.create({ data: { action, entity, entityId, actorId: actorId ?? null } });
}

function revalidateOrders() {
  revalidatePath('/[locale]/orders', 'page');
  revalidatePath('/[locale]/seller', 'page'); // seller negotiations panel
  revalidatePath('/[locale]/buyer/rfqs/[id]', 'page'); // buyer negotiations + timeline
}

/** Loads a deal with the parties needed for authorization. */
async function loadDealParties(dealId: string) {
  return prisma.deal.findUnique({
    where: { id: dealId },
    select: {
      id: true,
      rfq: { select: { buyerOrgId: true } },
      quote: { select: { sellerOrgId: true } },
      shipment: true,
    },
  });
}

/** Seller advances the shipment (pending → shipped → in_transit → delivered). */
export async function updateShipmentAction(formData: FormData): Promise<void> {
  const user = await currentUser();
  if (!user?.orgId) return;
  const dealId = String(formData.get('dealId') ?? '');
  const next = String(formData.get('status') ?? '');
  const deal = await loadDealParties(dealId);
  if (!deal || deal.quote.sellerOrgId !== user.orgId) return; // seller only

  const current = deal.shipment?.status ?? 'pending';
  if (!canSellerSet(current, next)) return;

  const carrier = cleanText(String(formData.get('carrier') ?? ''), 80) || null;
  const trackingRef = cleanText(String(formData.get('trackingRef') ?? ''), 80) || null;
  const etaRaw = String(formData.get('eta') ?? '').trim();
  const eta = etaRaw ? new Date(etaRaw) : undefined;

  const now = new Date();
  const data = {
    status: next,
    carrier,
    trackingRef,
    ...(eta && !Number.isNaN(eta.getTime()) ? { eta } : {}),
    ...(next === 'shipped' ? { shippedAt: now } : {}),
    ...(next === 'delivered' ? { deliveredAt: now } : {}),
  };
  await prisma.shipment.upsert({ where: { dealId }, create: { dealId, ...data }, update: data });
  await audit(`shipment.${next}`, 'Deal', dealId, user.id);
  revalidateOrders();
}

/** Buyer confirms receipt once the seller marked the shipment delivered. */
export async function confirmDeliveryAction(formData: FormData): Promise<void> {
  const user = await currentUser();
  if (!user?.orgId) return;
  const dealId = String(formData.get('dealId') ?? '');
  const deal = await loadDealParties(dealId);
  if (!deal || deal.rfq.buyerOrgId !== user.orgId) return; // buyer only
  if (!deal.shipment || !canBuyerConfirm(deal.shipment.status)) return;

  await prisma.shipment.update({ where: { dealId }, data: { status: 'confirmed', confirmedAt: new Date() } });
  await audit('shipment.confirmed', 'Deal', dealId, user.id);
  revalidateOrders();
}

/** Loads a quote's parties + its counter thread. */
async function loadQuoteThread(quoteId: string) {
  return prisma.quote.findUnique({
    where: { id: quoteId },
    select: {
      id: true,
      sellerOrgId: true,
      rfq: { select: { id: true, buyerOrgId: true, status: true } },
      counters: { orderBy: { createdAt: 'asc' } },
    },
  });
}

/** Either party proposes a counter price on a quote. */
export async function counterOfferAction(_prev: FulfillmentState, formData: FormData): Promise<FulfillmentState> {
  const user = await currentUser();
  if (!user?.orgId) return { error: 'unauthorized' };
  const quoteId = String(formData.get('quoteId') ?? '');
  const q = await loadQuoteThread(quoteId);
  if (!q) return { error: 'notFound' };

  const parties = [q.rfq.buyerOrgId, q.sellerOrgId];
  if (!parties.includes(user.orgId)) return { error: 'unauthorized' };
  if (q.rfq.status === 'awarded' || q.rfq.status === 'cancelled') return { error: 'rfqClosed' };

  const price = Number(formData.get('price'));
  if (!validCounter(price)) return { error: 'invalidPrice' };
  if (!canPropose(activeCounter(q.counters), user.orgId)) return { error: 'awaitingResponse' };

  const note = cleanText(String(formData.get('note') ?? ''), 300) || null;
  await prisma.$transaction([
    // A counter-back supersedes the other side's still-open offer.
    prisma.counterOffer.updateMany({ where: { quoteId, status: 'open' }, data: { status: 'superseded' } }),
    prisma.counterOffer.create({ data: { quoteId, byOrgId: user.orgId, proposedPrice: price, note, status: 'open' } }),
  ]);
  await audit('counter.proposed', 'Quote', quoteId, user.id);
  revalidateOrders();
  return { ok: true };
}

/** The party a counter is addressed to accepts (applies price) or declines it. */
export async function respondCounterAction(formData: FormData): Promise<void> {
  const user = await currentUser();
  if (!user?.orgId) return;
  const counterId = String(formData.get('counterId') ?? '');
  const decision = String(formData.get('decision') ?? ''); // accept | decline

  const counter = await prisma.counterOffer.findUnique({
    where: { id: counterId },
    select: { id: true, quoteId: true, byOrgId: true, status: true, proposedPrice: true, quote: { select: { sellerOrgId: true, rfq: { select: { buyerOrgId: true } } } } },
  });
  if (!counter) return;
  const parties = [counter.quote.rfq.buyerOrgId, counter.quote.sellerOrgId];
  if (!parties.includes(user.orgId)) return;
  if (!canRespond({ byOrgId: counter.byOrgId, status: counter.status, createdAt: new Date() }, user.orgId)) return;

  if (decision === 'accept') {
    await prisma.$transaction([
      prisma.quote.update({ where: { id: counter.quoteId }, data: { unitPrice: counter.proposedPrice } }),
      prisma.counterOffer.update({ where: { id: counterId }, data: { status: 'accepted' } }),
    ]);
    await audit('counter.accepted', 'Quote', counter.quoteId, user.id);
  } else {
    await prisma.counterOffer.update({ where: { id: counterId }, data: { status: 'declined' } });
    await audit('counter.declined', 'Quote', counter.quoteId, user.id);
  }
  revalidateOrders();
}
