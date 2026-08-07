import { prisma } from '@/lib/db';

/**
 * Public market activity feed.
 *
 * Two rules, both load-bearing:
 *
 * 1. REAL DATA ONLY. Every row here is derived from an actual record. Inventing
 *    liquidity signals to make a young marketplace look busy is fraud, and the
 *    moment it is discovered the trust proposition dies (BACKLOG R12 says this
 *    explicitly: "power with real data only").
 *
 * 2. THE BUYER SIDE IS ANONYMOUS. "Cipla is sourcing 2,000 kg of Paracetamol"
 *    tells every competitor and supplier exactly what a named pharma company is
 *    buying and in what volume. That is commercially sensitive, invites price
 *    discrimination against large names, and is the reason buyers ask for
 *    anonymised RFQs (R13). Suppliers are named — being listed is the service
 *    they are paying for; buyers are not.
 */

export type ActivityKind = 'listing' | 'verified' | 'rfq' | 'deal';

export interface ActivityItem {
  id: string;
  kind: ActivityKind;
  at: Date;
  /** Named ONLY for supplier-side events. Null on anything buyer-side. */
  actor: string | null;
  subject: string;
  detail?: string;
  href?: string;
}

/** Country only — enough for market colour, not enough to identify the buyer. */
function anonymiseBuyer(country: string): string {
  return country;
}

export async function getMarketActivity(limit = 8): Promise<ActivityItem[]> {
  const [products, verified, rfqs, deals] = await Promise.all([
    prisma.product.findMany({
      where: { status: 'live', org: { status: 'verified' } },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id: true, name: true, cas: true, createdAt: true, org: { select: { name: true } } },
    }),
    prisma.organization.findMany({
      where: { status: 'verified', kind: { in: ['seller', 'both'] }, verifiedAt: { not: null } },
      orderBy: { verifiedAt: 'desc' },
      take: limit,
      select: { id: true, name: true, country: true, verifiedAt: true },
    }),
    prisma.rfq.findMany({
      // Active sourcing only — an awarded/cancelled/expired RFQ is no longer a
      // live signal. Expiry is derived from requiredBy, so also drop past-due.
      where: { status: { in: ['open', 'quoted'] }, requiredBy: { gte: new Date() } },
      orderBy: { createdAt: 'desc' },
      take: limit,
      // NOTE: buyerOrg.name is deliberately NOT selected — country only.
      select: {
        id: true,
        productName: true,
        quantityKg: true,
        createdAt: true,
        buyerOrg: { select: { country: true } },
      },
    }),
    prisma.deal.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id: true, createdAt: true, rfq: { select: { productName: true } } },
    }),
  ]);

  const items: ActivityItem[] = [
    ...products.map((p) => ({
      id: `listing-${p.id}`,
      kind: 'listing' as const,
      at: p.createdAt,
      actor: p.org.name,
      subject: p.name,
      detail: `CAS ${p.cas}`,
      href: `/products/${p.id}`,
    })),
    ...verified.map((o) => ({
      id: `verified-${o.id}`,
      kind: 'verified' as const,
      at: o.verifiedAt!,
      actor: o.name,
      subject: o.country,
      href: `/suppliers/${o.id}`,
    })),
    ...rfqs.map((r) => ({
      id: `rfq-${r.id}`,
      kind: 'rfq' as const,
      at: r.createdAt,
      actor: null, // never name the buyer
      subject: r.productName,
      detail: `${r.quantityKg.toLocaleString()} kg · ${anonymiseBuyer(r.buyerOrg.country)}`,
    })),
    ...deals.map((d) => ({
      id: `deal-${d.id}`,
      kind: 'deal' as const,
      at: d.createdAt,
      actor: null, // neither party is named on a closed deal
      subject: d.rfq.productName,
    })),
  ];

  return items.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
}

/** Latest live listings from verified suppliers. */
export async function getLatestListings(limit = 6) {
  return prisma.product.findMany({
    where: { status: 'live', org: { status: 'verified' } },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: { org: { select: { id: true, name: true, city: true, country: true } } },
  });
}

/** Published news for a locale, newest first. */
export async function getLatestNews(locale: string, limit = 4) {
  return prisma.newsPost.findMany({
    where: { status: 'published', locale, publishedAt: { not: null } },
    orderBy: { publishedAt: 'desc' },
    take: limit,
  });
}
