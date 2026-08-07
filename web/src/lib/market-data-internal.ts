import type { PrismaClient } from '@prisma/client';
import { EVIDENCE_WEIGHT } from '@/lib/market-data';

/**
 * Mirrors platform quotes and closed deals into the price-observation table.
 *
 * Lives outside `market-data.server.ts` (which is `server-only`) so the Prisma
 * seed can call exactly the same code path the runtime connector does. Two
 * implementations of "what counts as a price" would drift, and the demo
 * database would stop matching production behaviour.
 *
 * Takes the client as an argument rather than importing `@/lib/db`, because the
 * seed runs its own PrismaClient instance.
 */

/**
 * Type-only import: Prisma's generated client types are structurally too
 * precise to fake with a hand-written interface (the `findMany` overloads carry
 * their own arg constraints), and a `type` import emits nothing at runtime.
 */
type PriceClient = Pick<PrismaClient, 'quote' | 'deal' | 'priceObservation'>;

export interface MirrorCounts {
  fetched: number;
  inserted: number;
  skipped: number;
}

export async function mirrorInternalPrices(prisma: PriceClient): Promise<MirrorCounts> {
  const [quotes, deals] = await Promise.all([
    prisma.quote.findMany({
      select: { id: true, unitPrice: true, currency: true, createdAt: true, rfq: { select: { cas: true, productName: true, quantityKg: true } } },
    }),
    prisma.deal.findMany({
      select: {
        id: true,
        currency: true,
        createdAt: true,
        quote: { select: { unitPrice: true } },
        rfq: { select: { cas: true, productName: true, quantityKg: true } },
      },
    }),
  ]);

  let inserted = 0;
  let skipped = 0;

  const write = async (
    ref: string,
    row: { cas: string; productName: string; quantityKg: number },
    price: number,
    currency: string,
    observedAt: Date,
    sourceType: 'internal_quote' | 'internal_deal',
    sourceName: string,
    weight: number,
  ) => {
    // Non-USD rows are skipped, never converted: a 2024 quote translated at
    // today's rate is a number nobody ever transacted at.
    if (currency !== 'USD' || !(price > 0)) {
      skipped++;
      return;
    }
    const data = {
      cas: row.cas,
      productName: row.productName,
      observedAt,
      unitPriceUsdKg: price,
      rawPrice: price,
      rawCurrency: currency,
      rawUnit: 'kg',
      quantityKg: row.quantityKg,
      region: 'WLD',
      sourceType,
      sourceName,
      sourceUrl: null,
      sourceRef: ref,
      weight,
    };
    await prisma.priceObservation.upsert({ where: { sourceRef: ref }, create: data, update: data });
    inserted++;
  };

  for (const q of quotes) {
    await write(`internal-quote:${q.id}`, q.rfq, q.unitPrice, q.currency, q.createdAt, 'internal_quote', 'PharmaLink quote', EVIDENCE_WEIGHT.internal_quote);
  }
  for (const d of deals) {
    await write(
      `internal-deal:${d.id}`,
      d.rfq,
      d.quote.unitPrice,
      d.currency,
      d.createdAt,
      'internal_deal',
      'PharmaLink closed deal',
      EVIDENCE_WEIGHT.internal_deal,
    );
  }

  return { fetched: quotes.length + deals.length, inserted, skipped };
}
