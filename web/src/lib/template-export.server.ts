import ExcelJS from 'exceljs';
import type { PrismaClient } from '@prisma/client';

import {
  SequenceAllocator,
  companyExternalId,
  contactExternalId,
  filingExternalId,
  productExternalId,
  sequenceOf,
  siteExternalId,
  type IdKind,
} from './external-id';
import {
  COMPANY_COLUMNS,
  CONTACT_COLUMNS,
  FACILITY_COLUMNS,
  FILING_COLUMNS,
  PRICE_COLUMNS,
  PRODUCT_SHEET_EXPORTS,
  type Column,
} from './template-export';

/**
 * Writes the curated catalogue back out as a v3 workbook.
 *
 * The counterpart to `supplier-import.server.ts`, and deliberately its mirror
 * image: download, edit in Excel, upload again. Every external ID is written,
 * because that is what makes the second upload an update rather than a
 * duplicate — the `externalId` columns exist for exactly this and nothing else.
 *
 * `exceljs` lives here and nowhere else on the write path, the same containment
 * the reader has, so the library stays replaceable in one file.
 */

/** How many price observations to write before truncating. */
const PRICE_ROW_CAP = 5_000;

/**
 * Gives every exportable record the external ID the template keys on, and
 * persists it.
 *
 * Only records created on the platform need this — anything that arrived
 * through the importer already carries the curator's ID, and those are never
 * touched: the template's promise is that an ID *never changes once assigned*,
 * and re-deriving one a contractor has already circulated breaks more than it
 * fixes.
 *
 * Assigning at export rather than at signup is deliberate. This is the first
 * moment a platform-native supplier needs a `Company_ID`, and the alternative
 * is worse in both directions: without an ID its products, sites, filings and
 * contacts cannot be written at all (every child sheet keys on the company),
 * and with a non-persisted ID the curator's edited file re-imports as a brand
 * new company instead of an update.
 *
 * Sequences continue from the highest already in use, per scope, so a backfill
 * never collides with an imported ID.
 */
async function assignMissingExternalIds(prisma: PrismaClient): Promise<number> {
  const [orgs, products, sites, filings, contacts] = await Promise.all([
    prisma.organization.findMany({ select: { id: true, country: true, externalId: true }, orderBy: { createdAt: 'asc' } }),
    prisma.product.findMany({ select: { id: true, orgId: true, cas: true, productType: true, externalId: true }, orderBy: { createdAt: 'asc' } }),
    prisma.site.findMany({ select: { id: true, orgId: true, country: true, regulatoryId: true, externalId: true }, orderBy: { id: 'asc' } }),
    prisma.regulatoryFiling.findMany({ select: { id: true, filedAt: true, createdAt: true, externalId: true }, orderBy: { id: 'asc' } }),
    prisma.contact.findMany({ select: { id: true, orgId: true, country: true, externalId: true }, orderBy: { id: 'asc' } }),
  ]);

  const countryOf = new Map(orgs.map((o) => [o.id, o.country]));
  const high: Record<string, number> = {};
  const mark = (scope: string, id: string | null) => {
    const n = sequenceOf(id);
    if (n !== null) high[scope] = Math.max(high[scope] ?? 0, n);
  };
  for (const o of orgs) mark(`company:${o.country}`, o.externalId);
  for (const p of products) mark(`product:${p.orgId}`, p.externalId);
  for (const s of sites) mark(`site:${s.orgId}`, s.externalId);
  for (const f of filings) mark(`filing:${(f.filedAt ?? f.createdAt).getUTCFullYear()}`, f.externalId);
  for (const c of contacts) mark(`contact:${countryOf.get(c.orgId) ?? ''}`, c.externalId);

  const alloc = new SequenceAllocator(high);
  let assigned = 0;

  for (const o of orgs.filter((r) => !r.externalId)) {
    const id = companyExternalId(o.country, alloc.take(`company:${o.country}`));
    // No ISO-3 for the country means no well-formed ID. Left blank rather than
    // invented — a malformed key is worse than an absent one.
    if (!id) continue;
    await prisma.organization.update({ where: { id: o.id }, data: { externalId: id } });
    assigned += 1;
  }
  for (const p of products.filter((r) => !r.externalId)) {
    const id = productExternalId(p.productType as IdKind, p.cas, alloc.take(`product:${p.orgId}`));
    if (!id) continue;
    await prisma.product.update({ where: { id: p.id }, data: { externalId: id } });
    assigned += 1;
  }
  for (const s of sites.filter((r) => !r.externalId)) {
    const id = siteExternalId(s.country ?? countryOf.get(s.orgId), s.regulatoryId, alloc.take(`site:${s.orgId}`));
    if (!id) continue;
    await prisma.site.update({ where: { id: s.id }, data: { externalId: id } });
    assigned += 1;
  }
  for (const f of filings.filter((r) => !r.externalId)) {
    const year = (f.filedAt ?? f.createdAt).getUTCFullYear();
    await prisma.regulatoryFiling.update({ where: { id: f.id }, data: { externalId: filingExternalId(year, alloc.take(`filing:${year}`)) } });
    assigned += 1;
  }
  for (const c of contacts.filter((r) => !r.externalId)) {
    const country = c.country ?? countryOf.get(c.orgId);
    const id = contactExternalId(country, alloc.take(`contact:${country ?? ''}`));
    if (!id) continue;
    await prisma.contact.update({ where: { id: c.id }, data: { externalId: id } });
    assigned += 1;
  }
  return assigned;
}

/**
 * Rows above the header, so the sheet looks like the template a curator knows
 * and — more usefully — so `findHeaderRow`'s banner-skipping path is exercised
 * by our own output rather than only by the real file.
 */
function addSheet<T>(wb: ExcelJS.Workbook, name: string, columns: Column<T>[], rows: T[], note: string): void {
  const ws = wb.addWorksheet(name);
  ws.addRow([name]);
  ws.addRow([note]);
  ws.addRow(['Edit and re-upload via Admin → Data Import. Do not rename or reorder the header row.']);
  const header = ws.addRow(columns.map((c) => c.header));
  header.font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: header.number }];
  for (const row of rows) ws.addRow(columns.map((c) => c.value(row)));
  // Enough width to read an FEI or a CAS without resizing every column by hand.
  ws.columns.forEach((col, i) => {
    col.width = Math.min(42, Math.max(12, columns[i].header.length + 2));
  });
}

export interface ExportOptions {
  /** Restrict to one organisation. Omitted, every verified-or-curated org goes. */
  orgId?: string;
  /** Include price observations. They dominate the row count on a real corpus. */
  includePrices?: boolean;
}

export interface ExportResult {
  buffer: Buffer;
  counts: Record<string, number>;
  /** External IDs minted for platform-native records during this export. */
  idsAssigned: number;
  /** Rows left out because their company has no exportable `Company_ID`. */
  skippedWithoutCompanyId: number;
  /** Set when the price sheet hit `PRICE_ROW_CAP`, so the UI can say so. */
  truncated: string[];
}

export async function buildTemplateWorkbook(prisma: PrismaClient, opts: ExportOptions = {}): Promise<ExportResult> {
  const idsAssigned = await assignMissingExternalIds(prisma);

  const orgWhere = opts.orgId ? { id: opts.orgId } : {};
  const childWhere = opts.orgId ? { orgId: opts.orgId } : {};

  const [orgs, products, filings, sites, contacts] = await Promise.all([
    prisma.organization.findMany({ where: orgWhere, orderBy: { name: 'asc' } }),
    prisma.product.findMany({ where: childWhere, orderBy: [{ orgId: 'asc' }, { name: 'asc' }] }),
    prisma.regulatoryFiling.findMany({ where: childWhere, orderBy: [{ orgId: 'asc' }, { filingNumber: 'asc' }] }),
    prisma.site.findMany({ where: childWhere, orderBy: [{ orgId: 'asc' }, { name: 'asc' }] }),
    prisma.contact.findMany({ where: childWhere, orderBy: [{ orgId: 'asc' }, { lastName: 'asc' }] }),
  ]);

  // A child row whose company has no external ID cannot be re-imported — the
  // importer keys on Company_ID and rejects rather than minting a shell org.
  // Skipping them here is honest; writing them would produce a file that fails
  // on upload with no explanation.
  const externalIdByOrg = new Map(orgs.map((o) => [o.id, o.externalId]));
  const companyRef = (orgId: string): string | null => externalIdByOrg.get(orgId) ?? null;
  let skippedWithoutCompanyId = 0;
  const withCompany = <T extends { orgId: string }>(rows: T[]): (T & { companyExternalId: string })[] =>
    rows.flatMap((r) => {
      const ref = companyRef(r.orgId);
      if (!ref) {
        skippedWithoutCompanyId += 1;
        return [];
      }
      return [{ ...r, companyExternalId: ref }];
    });

  const wb = new ExcelJS.Workbook();
  wb.creator = 'PharmaLink';
  // No `created`/`modified` stamp: a byte-identical export for identical data
  // makes "has anything changed since I last downloaded?" answerable by hash.

  const counts: Record<string, number> = {};

  addSheet(wb, '1. Company Master', COMPANY_COLUMNS, orgs, 'One row per organisation. Company_ID is the key every other sheet references.');
  counts['1. Company Master'] = orgs.length;

  const productRows = withCompany(products);
  for (const { sheet, productTypes, columns } of PRODUCT_SHEET_EXPORTS) {
    const rows = productRows.filter((p) => productTypes.includes(p.productType));
    addSheet(wb, sheet, columns, rows, 'One row per listing. Product_ID is unique within a company, not globally.');
    counts[sheet] = rows.length;
  }

  if (opts.includePrices !== false) {
    const observations = await prisma.priceObservation.findMany({
      orderBy: { observedAt: 'desc' },
      take: PRICE_ROW_CAP + 1,
      ...(opts.orgId ? { where: { supplierOrgId: opts.orgId } } : {}),
    });
    const capped = observations.slice(0, PRICE_ROW_CAP);
    addSheet(
      wb,
      '6. Price Intelligence',
      PRICE_COLUMNS,
      capped.map((o) => ({ ...o, companyExternalId: o.supplierOrgId ? companyRef(o.supplierOrgId) : null })),
      'One row per observation. Price is the ORIGINAL currency with the rate used, so it stays auditable.',
    );
    counts['6. Price Intelligence'] = capped.length;
    if (observations.length > PRICE_ROW_CAP) counts['6. Price Intelligence (truncated at)'] = PRICE_ROW_CAP;
  }

  const filingRows = withCompany(filings);
  addSheet(wb, '7. Regulatory Filings', FILING_COLUMNS, filingRows, 'A submission others reference. A DMF with no expiry leaves Expiry Date blank.');
  counts['7. Regulatory Filings'] = filingRows.length;

  const siteRows = withCompany(sites);
  addSheet(wb, '8. Manufacturing Facilities', FACILITY_COLUMNS, siteRows, 'One row per site. Capacity always travels with its unit.');
  counts['8. Manufacturing Facilities'] = siteRows.length;

  const contactRows = withCompany(contacts);
  addSheet(
    wb,
    '9. Key Contacts',
    CONTACT_COLUMNS,
    contactRows,
    'Business contact details only. The template’s personal-data columns are neither imported nor exported.',
  );
  counts['9. Key Contacts'] = contactRows.length;

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  const truncated = opts.includePrices !== false && counts['6. Price Intelligence'] === PRICE_ROW_CAP ? ['6. Price Intelligence'] : [];
  return { buffer, counts, truncated, idsAssigned, skippedWithoutCompanyId };
}

/** `pharmalink-catalogue-2026-08-10.xlsx` — sorts chronologically in a folder. */
export function exportFilename(now: Date, orgName?: string): string {
  const slug = orgName ? `-${orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)}` : '';
  return `pharmalink-catalogue${slug}-${now.toISOString().slice(0, 10)}.xlsx`;
}
