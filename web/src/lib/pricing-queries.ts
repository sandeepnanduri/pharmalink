import { prisma } from '@/lib/db';
import { aggregatePrices, vsMarket } from '@/lib/pricing';

/** Market price bands per molecule (CAS), built from REAL submitted quotes. */
export async function getMarketPriceIndex(limit = 12) {
  const quotes = await prisma.quote.findMany({
    select: { unitPrice: true, rfq: { select: { cas: true, productName: true } } },
  });
  const byCas = new Map<string, { productName: string; prices: number[] }>();
  for (const q of quotes) {
    const cas = q.rfq.cas;
    const entry = byCas.get(cas) ?? { productName: q.rfq.productName, prices: [] };
    entry.prices.push(q.unitPrice);
    byCas.set(cas, entry);
  }
  return [...byCas.entries()]
    .map(([cas, v]) => ({ cas, productName: v.productName, band: aggregatePrices(v.prices) }))
    .sort((a, b) => b.band.count - a.band.count)
    .slice(0, limit);
}

/** A buyer's real spend from completed deals, by product. */
export async function getBuyerSpend(orgId: string) {
  const deals = await prisma.deal.findMany({
    where: { rfq: { buyerOrgId: orgId } },
    select: { totalValue: true, currency: true, rfq: { select: { productName: true } } },
  });
  const total = deals.reduce((a, d) => a + d.totalValue, 0);
  const byProduct = new Map<string, number>();
  for (const d of deals) byProduct.set(d.rfq.productName, (byProduct.get(d.rfq.productName) ?? 0) + d.totalValue);
  const products = [...byProduct.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  return { total, dealCount: deals.length, products, currency: deals[0]?.currency ?? 'USD' };
}

/** For each of a seller's live products, its price vs the real market average. */
export async function getSellerCompetitiveness(orgId: string) {
  const [products, quotes] = await Promise.all([
    prisma.product.findMany({
      where: { orgId, status: 'live' },
      select: { id: true, name: true, cas: true, priceMin: true, priceMax: true },
    }),
    prisma.quote.findMany({ select: { unitPrice: true, rfq: { select: { cas: true } } } }),
  ]);
  const byCas = new Map<string, number[]>();
  for (const q of quotes) {
    const arr = byCas.get(q.rfq.cas) ?? [];
    arr.push(q.unitPrice);
    byCas.set(q.rfq.cas, arr);
  }
  return products.map((p) => {
    const band = aggregatePrices(byCas.get(p.cas) ?? []);
    const myPrice =
      p.priceMin != null && p.priceMax != null ? Math.round(((p.priceMin + p.priceMax) / 2) * 100) / 100 : p.priceMin ?? p.priceMax ?? 0;
    return { ...p, myPrice, band, cmp: band.count > 0 && myPrice > 0 ? vsMarket(myPrice, band.avg) : null };
  });
}
