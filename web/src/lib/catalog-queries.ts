import { prisma } from '@/lib/db';
import type { Prisma } from '@prisma/client';
import type { ParsedFilters } from '@/lib/filters';
import { resolveFacet, resolveSegment } from '@/lib/taxonomy';

/**
 * Catalogue search.
 *
 * Two invariants that are security-relevant, not just correctness:
 *
 *  1. **Only live listings from ops-verified suppliers are ever returned.** This
 *     is applied here, in one place, rather than in the page — a second caller
 *     that forgot it would expose unverified suppliers to buyers.
 *  2. **A certification filter is an AND, never an OR.** A buyer selecting
 *     "US FDA GMP" and "EU GMP" needs suppliers holding BOTH. Matching either
 *     would surface suppliers who cannot legally serve their market, which is
 *     the single most dangerous way this screen could be wrong.
 */

export interface CatalogResult {
  products: Awaited<ReturnType<typeof runQuery>>;
  total: number;
  supplierCount: number;
  /** Facet counts for the filter rail, so options can show how many they'd yield. */
  counts: { certs: Record<string, number>; countries: Record<string, number>; types: Record<string, number> };
  /** Set when the free-text query matched a taxonomy term rather than a name. */
  interpretedAs: string | null;
}

function runQuery(where: Prisma.ProductWhereInput, orderBy: Prisma.ProductOrderByWithRelationInput[], take: number) {
  return prisma.product.findMany({
    where,
    orderBy,
    take,
    include: {
      org: {
        select: {
          id: true,
          name: true,
          city: true,
          country: true,
          website: true,
          logoUrl: true,
          supplierType: true,
          certifications: { where: { status: 'verified' }, select: { name: true } },
          regulatoryActions: { where: { status: 'open' }, select: { kind: true } },
        },
      },
    },
  });
}

const SORT_MAP: Record<string, Prisma.ProductOrderByWithRelationInput[]> = {
  relevance: [{ createdAt: 'desc' }],
  newest: [{ createdAt: 'desc' }],
  price_low: [{ priceMin: 'asc' }],
  price_high: [{ priceMin: 'desc' }],
  moq_low: [{ moqKg: 'asc' }],
  // Lead time is free text on the listing, so it cannot be ordered in SQL
  // without a numeric column. Falls back to newest rather than pretending.
  lead_time: [{ createdAt: 'desc' }],
};

export async function searchCatalog(f: ParsedFilters, take = 60): Promise<CatalogResult> {
  // Free text: try the taxonomy first so "bulk drug" and "softgel" narrow the
  // segment instead of running a fruitless name search.
  let interpretedAs: string | null = null;
  const segmentHit = f.q ? resolveSegment(f.q) : null;
  const facetHit = f.q ? resolveFacet(f.q) : null;
  const typeFilter = [...f.type];
  const facetFilter = [...f.therapeuticArea, ...f.doseForm, ...f.excipientFunction];

  if (segmentHit && typeFilter.length === 0) {
    typeFilter.push(segmentHit.type);
    interpretedAs = segmentHit.label;
  } else if (facetHit && facetFilter.length === 0) {
    facetFilter.push(facetHit.node.id);
    interpretedAs = facetHit.node.label;
  }

  const orgWhere: Prisma.OrganizationWhereInput = {
    status: 'verified',
    ...(f.country.length ? { country: { in: f.country } } : {}),
    // AND across certificates — see the invariant above.
    ...(f.cert.length ? { AND: f.cert.map((name) => ({ certifications: { some: { name, status: 'verified' } } })) } : {}),
    // "No open regulatory action" must mean exactly that: none open, of any kind.
    ...(f.noRegulatoryAction ? { regulatoryActions: { none: { status: 'open' } } } : {}),
  };

  const filingWhere: Prisma.ProductWhereInput[] = [];
  if (f.filing.includes('dmf')) filingWhere.push({ dmfNumber: { not: null } });
  if (f.filing.includes('cep')) filingWhere.push({ cepNumber: { not: null } });
  if (f.filing.includes('copp')) filingWhere.push({ coppNumber: { not: null } });
  if (f.filing.includes('asmf')) filingWhere.push({ asmfNumber: { not: null } });

  const where: Prisma.ProductWhereInput = {
    status: 'live',
    org: orgWhere,
    ...(typeFilter.length ? { productType: { in: typeFilter } } : {}),
    ...(facetFilter.length ? { facet: { in: facetFilter } } : {}),
    ...(f.pharmacopoeia.length ? { OR: f.pharmacopoeia.map((g) => ({ grade: { contains: g } })) } : {}),
    ...(f.purityMin != null ? { purityPct: { gte: f.purityMin } } : {}),
    ...(f.priceMin != null ? { priceMin: { gte: f.priceMin } } : {}),
    ...(f.priceMax != null ? { priceMin: { lte: f.priceMax } } : {}),
    ...(f.moqMax != null ? { moqKg: { lte: f.moqMax } } : {}),
    ...(f.sampleAvailable ? { sampleAvailable: true } : {}),
    ...(f.coldChain.length ? { coldChain: { in: f.coldChain } } : {}),
    ...(f.incoterm.length ? { OR: f.incoterm.map((i) => ({ incoterms: { contains: i } })) } : {}),
    ...(filingWhere.length ? { AND: filingWhere } : {}),
    // Free text still searches name and CAS — the taxonomy hit narrows, it does
    // not replace, so "paracetamol" keeps working.
    ...(f.q && !interpretedAs ? { OR: [{ name: { contains: f.q } }, { cas: { contains: f.q } }] } : {}),
  };

  const [products, total] = await Promise.all([
    runQuery(where, SORT_MAP[f.sort] ?? SORT_MAP.relevance, take),
    prisma.product.count({ where }),
  ]);

  // Facet counts computed over the CURRENT result set, so a buyer can see what
  // each remaining option would yield rather than guessing.
  const counts = { certs: {} as Record<string, number>, countries: {} as Record<string, number>, types: {} as Record<string, number> };
  for (const p of products) {
    counts.types[p.productType] = (counts.types[p.productType] ?? 0) + 1;
    if (p.org.country) counts.countries[p.org.country] = (counts.countries[p.org.country] ?? 0) + 1;
    for (const c of p.org.certifications) counts.certs[c.name] = (counts.certs[c.name] ?? 0) + 1;
  }

  return {
    products,
    total,
    supplierCount: new Set(products.map((p) => p.orgId)).size,
    counts,
    interpretedAs,
  };
}
