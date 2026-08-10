import { prisma } from '@/lib/db';
import { sameCompany } from '@/lib/associations';
import { partitionObservations, summariseEvidence } from '@/lib/price-evidence';
import {
  combineCoverage,
  coverage,
  findDuplicates,
  freshness,
  rankByQuality,
  type Coverage,
  type DuplicateCandidate,
  type FreshnessBucket,
  type OrgQuality,
} from '@/lib/data-quality';

/**
 * The numbers behind Admin → Data quality.
 *
 * One pass over the curated tables, then pure functions. Deliberately not a
 * per-organisation query in a loop: the whole point of the page is the
 * comparison across organisations, and N+1 over 46 companies on SQLite would
 * hold the write lock long enough to be felt elsewhere.
 */

/**
 * The fields a curated organisation is scored on.
 *
 * A judgement call, stated once here rather than scattered through the query:
 * these are the fields a buyer looks for or ops needs to verify. Adding a
 * rarely-used column would dilute every score without telling anyone anything.
 */
const ORG_SCORED = {
  country: true,
  city: true,
  website: true,
  about: true,
  supplierType: true,
  foundedYear: true,
  employees: true,
  exportMarkets: true,
  defaultIncoterm: true,
  defaultPaymentTerms: true,
  generalEmail: true,
  feiNumber: true,
  regNumber: true,
  therapeuticAreas: true,
  sourceUrl: true,
} as const;

const PRODUCT_SCORED = {
  cas: true,
  grade: true,
  purity: true,
  moqKg: true,
  leadTimeDays: true,
  priceMin: true,
  incoterms: true,
  packaging: true,
  stockStatus: true,
  facet: true,
} as const;

const SITE_SCORED = {
  city: true,
  country: true,
  regulatoryId: true,
  fdaGmpStatus: true,
  capacityValue: true,
  manufacturingType: true,
} as const;

/**
 * The scored fields, read off the selects above.
 *
 * One declaration each, so the query cannot fetch a column the score ignores or
 * -- worse -- score a column the query never fetched, which would read as a
 * permanent gap in every supplier's coverage.
 */
const ORG_FIELDS = Object.keys(ORG_SCORED) as (keyof typeof ORG_SCORED)[];
const PRODUCT_FIELDS = Object.keys(PRODUCT_SCORED) as (keyof typeof PRODUCT_SCORED)[];
const SITE_FIELDS = Object.keys(SITE_SCORED) as (keyof typeof SITE_SCORED)[];

export interface PriceQuality {
  total: number;
  used: number;
  excluded: number;
  confidence: { HIGH: number; MEDIUM: number; LOW: number; unstated: number };
  /** Observations with no supplier attributed — cannot appear in any comparison. */
  unattributed: number;
  /** Observations whose price is not per-kilogram. Excluded from all price maths. */
  nonKg: number;
}

export interface DataQuality {
  orgs: OrgQuality[];
  overall: Coverage;
  freshnessCounts: Record<FreshnessBucket, number>;
  duplicates: DuplicateCandidate[];
  prices: PriceQuality;
  /** Curated records carrying no source URL at all. */
  missingSource: { organizations: number; products: number; sites: number; filings: number };
}

const pick = <T extends object>(row: T, fields: readonly (keyof T & string)[]): unknown[] => fields.map((f) => row[f]);

export async function getDataQuality(now: Date = new Date()): Promise<DataQuality> {
  const [orgs, products, sites, filings, contacts, observations] = await Promise.all([
    // Selling organisations only. The curation template is a *supplier*
    // catalogue: it scores FEI numbers, export markets, plants and listings. A
    // buyer has none of those by design and would sit permanently at the bottom
    // of the queue for work nobody should ever do.
    prisma.organization.findMany({
      where: { kind: { in: ['seller', 'both'] } },
      // Explicit select, not the whole row. This page reads every product,
      // site, filing and contact on the platform in one pass; pulling columns
      // it never scores is bytes off the one SQLite connection every other
      // request is waiting on.
      select: { ...ORG_SCORED, id: true, name: true, status: true, externalId: true, lastVerifiedAt: true, gstin: true },
      orderBy: { name: 'asc' },
    }),
    prisma.product.findMany({ select: { ...PRODUCT_SCORED, orgId: true, sourceUrl: true } }),
    prisma.site.findMany({ select: { ...SITE_SCORED, orgId: true, sourceUrl: true } }),
    prisma.regulatoryFiling.findMany({ select: { id: true, orgId: true, sourceUrl: true } }),
    prisma.contact.findMany({ select: { id: true, orgId: true } }),
    prisma.priceObservation.findMany({
      select: {
        observedAt: true,
        unitPriceUsdKg: true,
        weight: true,
        dataConfidence: true,
        originCountry: true,
        incoterm: true,
        purityGrade: true,
        outlierFlag: true,
        outlierReason: true,
        supplierOrgId: true,
      },
    }),
  ]);

  const by = <T extends { orgId: string }>(rows: T[]): Map<string, T[]> => {
    const m = new Map<string, T[]>();
    for (const r of rows) m.set(r.orgId, [...(m.get(r.orgId) ?? []), r]);
    return m;
  };
  const productsBy = by(products);
  const sitesBy = by(sites);
  const filingsBy = by(filings);
  const contactsBy = by(contacts);

  const rows: OrgQuality[] = orgs.map((o) => {
    const orgProducts = productsBy.get(o.id) ?? [];
    const orgSites = sitesBy.get(o.id) ?? [];
    const orgFilings = filingsBy.get(o.id) ?? [];

    // The organisation's own fields plus its children's, weighted by field
    // count. A company with a rich profile and forty empty listings is not a
    // well-curated company, and a per-record average would say it was.
    const parts = [
      coverage(pick(o, ORG_FIELDS)),
      ...orgProducts.map((p) => coverage(pick(p, PRODUCT_FIELDS))),
      ...orgSites.map((s) => coverage(pick(s, SITE_FIELDS))),
    ];

    return {
      orgId: o.id,
      name: o.name,
      country: o.country ?? '',
      status: o.status,
      externalId: o.externalId,
      coverage: combineCoverage(parts),
      products: orgProducts.length,
      sites: orgSites.length,
      filings: orgFilings.length,
      contacts: (contactsBy.get(o.id) ?? []).length,
      freshness: freshness(o.lastVerifiedAt, now),
      lastVerifiedAt: o.lastVerifiedAt,
      missingSource:
        (o.sourceUrl ? 0 : 1) +
        orgProducts.filter((p) => !p.sourceUrl).length +
        orgSites.filter((s) => !s.sourceUrl).length +
        orgFilings.filter((f) => !f.sourceUrl).length,
    };
  });

  const freshnessCounts: Record<FreshnessBucket, number> = { fresh: 0, ageing: 0, outdated: 0, never: 0 };
  for (const r of rows) freshnessCounts[r.freshness] += 1;

  const evidence = summariseEvidence(observations);
  const { excluded } = partitionObservations(observations);

  // Every observation is stored per-kilogram by definition — `unitPriceUsdKg`
  // is documented as the only field the maths reads. A non-positive value is
  // the one way a row can be present but unusable.
  const nonKg = observations.filter((o) => !(o.unitPriceUsdKg > 0)).length;

  return {
    orgs: rankByQuality(rows),
    overall: combineCoverage(rows.map((r) => r.coverage)),
    freshnessCounts,
    duplicates: findDuplicates(
      orgs.map((o) => ({ id: o.id, name: o.name, feiNumber: o.feiNumber, gstin: o.gstin })),
      sameCompany,
    ),
    prices: {
      total: evidence.total,
      used: evidence.used,
      excluded: excluded.length,
      confidence: evidence.confidence,
      unattributed: observations.filter((o) => !o.supplierOrgId).length,
      nonKg,
    },
    missingSource: {
      organizations: orgs.filter((o) => !o.sourceUrl).length,
      products: products.filter((p) => !p.sourceUrl).length,
      sites: sites.filter((s) => !s.sourceUrl).length,
      filings: filings.filter((f) => !f.sourceUrl).length,
    },
  };
}
