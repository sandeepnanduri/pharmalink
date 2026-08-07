import { prisma } from '@/lib/db';

/**
 * Live buyer demand per product, by CAS: how many currently-active RFQs
 * (open/quoted, not past their deadline) name each molecule. Real signal — a
 * seller sees where genuine sourcing interest exists.
 */
export async function getDemandByCas(casList: string[]): Promise<Record<string, number>> {
  if (casList.length === 0) return {};
  const grouped = await prisma.rfq.groupBy({
    by: ['cas'],
    where: { cas: { in: casList }, status: { in: ['open', 'quoted'] }, requiredBy: { gte: new Date() } },
    _count: { _all: true },
  });
  const out: Record<string, number> = {};
  for (const g of grouped) out[g.cas] = g._count._all;
  return out;
}
