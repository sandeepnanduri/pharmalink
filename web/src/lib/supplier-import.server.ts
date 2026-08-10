import { prisma } from '@/lib/db';
import { sameCompany } from '@/lib/associations';
import { withRun } from '@/lib/ingest-run.server';
import { readSheet } from '@/lib/xlsx.server';
import {
  PRODUCT_SHEETS,
  fanOutHistory,
  mapCompany,
  mapContact,
  mapFacility,
  mapFiling,
  mapPrice,
  mapProduct,
  type Cells,
  type CompanyRow,
  type ContactRow,
  type ErrorCode,
  type FacilityRow,
  type FilingRow,
  type PriceRow,
  type ProductRow,
  type RowIssue,
} from '@/lib/sheet-mappers';

/**
 * The supplier-catalogue importer.
 *
 * Two phases, following the association importer's precedent and its stated
 * reason: *an import that silently creates 200 shell organisations is very hard
 * to unpick.* Preview resolves everything and writes nothing; apply writes what
 * preview said it would.
 *
 * Three rules that shape the whole thing:
 *
 *  1. **Only the Company Master sheet may create an organisation.** A product
 *     row naming an unknown company is rejected, never used to mint a shell.
 *  2. **A rejected company rejects its dependents.** Preview resolves the whole
 *     graph before reporting, so a curator is not told "38 products imported"
 *     when the company they hang off was refused.
 *  3. **Nothing writes `Organization.status` or `RegulatoryAction`.** The first
 *     is ops approval and would publish an unreviewed supplier; the second is
 *     an adverse finding that, per the schema, is never self-declared.
 */

export const SUPPLIER_CATALOGUE_SHEETS = {
  company: '1. Company Master',
  facility: '8. Manufacturing Facilities',
  filing: '7. Regulatory Filings',
  contact: '9. Key Contacts',
  price: '6. Price Intelligence',
} as const;

export interface SheetReport {
  sheet: string;
  read: number;
  valid: number;
  needsReview: number;
  rejected: number;
  /** Present when the sheet itself could not be read. */
  problem?: string;
}

export interface ReportedIssue extends RowIssue {
  sheet: string;
  row: number;
  /** `'2. API Products'!I47` — what a curator types into the Name Box. */
  location: string;
}

/**
 * 25 MB. The full v3 template with 46 companies is well under 1 MB.
 *
 * Lives here, not on the route: Next allows a route module to export only its
 * handlers and a fixed set of config names, and the upload UI needs to state
 * the cap to the operator.
 */
export const MAX_IMPORT_BYTES = 25 * 1024 * 1024;

export interface ImportReport {
  sheets: SheetReport[];
  issues: ReportedIssue[];
  /** Companies matched by name rather than id, which apply will skip. */
  needsReview: { sheet: string; row: number; name: string; candidate: string }[];
  /**
   * `created` and `updated` are separate on purpose. The acceptance test for
   * this whole feature is that applying the same file twice creates nothing
   * the second time; a single "written" number would report six on a clean
   * re-run and read as duplication.
   */
  totals: { read: number; valid: number; rejected: number; created: number; updated: number };
}

/** Enough detail to fix a file, not a wall of text. */
const MAX_REPORTED_ISSUES = 500;

/**
 * Interactive-transaction budget. A company plus its sites, products, filings
 * and contacts is the unit of atomicity; on SQLite that also holds a write lock
 * on the one database file, so it must not run long enough to block the
 * operator's own page loads while they watch the import.
 */
const TX_TIMEOUT_MS = 20_000;
const TX_MAX_WAIT_MS = 10_000;

type Rows<T> = { row: T; sheet: string; rowNumber: number }[];

interface Parsed {
  companies: Rows<CompanyRow>;
  facilities: Rows<FacilityRow>;
  products: Rows<ProductRow>;
  filings: Rows<FilingRow>;
  contacts: Rows<ContactRow>;
  prices: Rows<PriceRow>;
  report: ImportReport;
}

function location(sheet: string, ref?: string): string {
  return ref ? `'${sheet}'!${ref}` : `'${sheet}'`;
}

function collect(
  report: ImportReport,
  sheet: string,
  rowNumber: number,
  issues: RowIssue[],
): void {
  for (const issue of issues) {
    if (report.issues.length >= MAX_REPORTED_ISSUES) return;
    report.issues.push({ ...issue, sheet, row: rowNumber, location: location(sheet, issue.cellRef) });
  }
}

async function parseSheet<T>(
  buffer: Buffer,
  sheet: string,
  mapper: (c: Cells) => { row?: T; issues: RowIssue[] },
  report: ImportReport,
  onRow?: (row: T, cells: Cells) => void,
): Promise<Rows<T>> {
  const { sheet: data, problem } = await readSheet(buffer, sheet);
  const summary: SheetReport = { sheet, read: 0, valid: 0, needsReview: 0, rejected: 0 };
  const out: Rows<T> = [];

  if (!data) {
    // A missing sheet is reported, not fatal: a curator legitimately uploads a
    // workbook with only the sheets they have data for.
    summary.problem = problem;
    report.sheets.push(summary);
    return out;
  }

  for (const { rowNumber, cells } of data.rows) {
    summary.read += 1;
    const result = mapper(cells);
    collect(report, sheet, rowNumber, result.issues);
    if (result.row) {
      summary.valid += 1;
      out.push({ row: result.row, sheet, rowNumber });
      onRow?.(result.row, cells);
    } else {
      summary.rejected += 1;
    }
  }

  report.sheets.push(summary);
  return out;
}

/** Reads and maps every sheet. Writes nothing. */
export async function parseWorkbook(buffer: Buffer): Promise<Parsed> {
  const report: ImportReport = { sheets: [], issues: [], needsReview: [], totals: { read: 0, valid: 0, rejected: 0, created: 0, updated: 0 } };

  const companies = await parseSheet(buffer, SUPPLIER_CATALOGUE_SHEETS.company, mapCompany, report);
  const facilities = await parseSheet(buffer, SUPPLIER_CATALOGUE_SHEETS.facility, mapFacility, report);

  const products: Rows<ProductRow> = [];
  for (const { sheet, opts } of PRODUCT_SHEETS) {
    products.push(...(await parseSheet(buffer, sheet, (c) => mapProduct(c, opts), report)));
  }

  const filings = await parseSheet(buffer, SUPPLIER_CATALOGUE_SHEETS.filing, mapFiling, report);
  const contacts = await parseSheet(buffer, SUPPLIER_CATALOGUE_SHEETS.contact, mapContact, report);

  // Price rows fan their 24-month history out into separate observations, which
  // is the only way `forecast()` can see them — it reads a series from rows.
  const prices: Rows<PriceRow> = [];
  await parseSheet(buffer, SUPPLIER_CATALOGUE_SHEETS.price, mapPrice, report, (row, cells) => {
    prices.push({ row, sheet: SUPPLIER_CATALOGUE_SHEETS.price, rowNumber: 0 });
    for (const h of fanOutHistory(cells, row)) prices.push({ row: h, sheet: SUPPLIER_CATALOGUE_SHEETS.price, rowNumber: 0 });
  });

  for (const s of report.sheets) {
    report.totals.read += s.read;
    report.totals.valid += s.valid;
    report.totals.rejected += s.rejected;
  }

  return { companies, facilities, products, filings, contacts, prices, report };
}

export interface ResolvedPlan extends Parsed {
  /** Company external id → the Organization id it will be written to. */
  companyIds: Map<string, string>;
  /** External ids this file references but cannot resolve. */
  unknownCompanies: Set<string>;
}

/**
 * Works out which organisation every row belongs to, before anything is
 * written.
 *
 * Three cases, three different answers — this is where importers usually go
 * wrong by collapsing them into one:
 *
 *  - The `Company_ID` matches an existing `Organization.externalId`: attach.
 *  - No id match, but the name matches an existing organisation closely enough
 *    for `sameCompany`: report as needs-review and **skip on apply**.
 *    Auto-attaching a product to the wrong Sun Pharma entity is unrecoverable.
 *  - No match at all: reject the row. Never mint a shell organisation from a
 *    product sheet.
 */
export async function resolvePlan(parsed: Parsed): Promise<ResolvedPlan> {
  const { report } = parsed;
  const companyIds = new Map<string, string>();
  const unknownCompanies = new Set<string>();

  const existing = await prisma.organization.findMany({ select: { id: true, name: true, externalId: true } });
  const byExternalId = new Map(existing.filter((o) => o.externalId).map((o) => [o.externalId!, o]));

  // Companies present in the file are resolvable by definition — apply either
  // updates the matching org or creates one.
  for (const { row, sheet, rowNumber } of parsed.companies) {
    if (!row.externalId) continue;
    const match = byExternalId.get(row.externalId);
    if (match) {
      companyIds.set(row.externalId, match.id);
      continue;
    }
    // No id match. Before creating, check whether we already hold this company
    // under a different id — `sameCompany` exists for exactly this.
    const fuzzy = existing.find((o) => sameCompany(o.name, row.name));
    if (fuzzy) {
      report.needsReview.push({ sheet, row: rowNumber, name: row.name, candidate: fuzzy.name });
      continue;
    }
    companyIds.set(row.externalId, ''); // to be created
  }

  // Rows referencing a company neither in the file nor on the platform.
  const referenced = [
    ...parsed.facilities.map((r) => ({ ...r, id: r.row.companyExternalId })),
    ...parsed.products.map((r) => ({ ...r, id: r.row.companyExternalId })),
    ...parsed.filings.map((r) => ({ ...r, id: r.row.companyExternalId })),
    ...parsed.contacts.map((r) => ({ ...r, id: r.row.companyExternalId })),
  ];
  for (const r of referenced) {
    if (companyIds.has(r.id) || byExternalId.has(r.id)) {
      if (!companyIds.has(r.id)) companyIds.set(r.id, byExternalId.get(r.id)!.id);
      continue;
    }
    unknownCompanies.add(r.id);
    collect(report, r.sheet, r.rowNumber, [{ code: 'company.unknown' as ErrorCode, column: 'company id', value: r.id }]);
    // The row mapped cleanly but has nowhere to go, so it must not keep
    // counting as valid: "38 products valid" followed by 37 written is exactly
    // the kind of report that gets ignored.
    const summary = report.sheets.find((x) => x.sheet === r.sheet);
    if (summary) {
      summary.valid = Math.max(0, summary.valid - 1);
      summary.rejected += 1;
    }
    report.totals.valid = Math.max(0, report.totals.valid - 1);
    report.totals.rejected += 1;
  }

  return { ...parsed, companyIds, unknownCompanies };
}

const belongs = (plan: ResolvedPlan, id: string) => plan.companyIds.has(id);

/**
 * Writes the plan.
 *
 * Atomic per company: the org, its sites, products, filings and contacts either
 * all land or none do, which gives an honest partial-success story
 * ("38 of 46 companies applied"). Price observations stay OUTSIDE that
 * transaction — they are CAS-keyed rather than org-keyed, idempotent by
 * `sourceRef`, and a thousand of them inside a per-company transaction would
 * blow the timeout and hold SQLite's single write lock while they did it.
 */
export async function applyPlan(plan: ResolvedPlan, actorId: string | null): Promise<ImportReport> {
  const { report } = plan;
  let created = 0;
  let updated = 0;

  const byCompany = new Map<string, { company?: CompanyRow; facilities: FacilityRow[]; products: ProductRow[]; filings: FilingRow[]; contacts: ContactRow[] }>();
  const bucket = (id: string) => {
    if (!byCompany.has(id)) byCompany.set(id, { facilities: [], products: [], filings: [], contacts: [] });
    return byCompany.get(id)!;
  };

  for (const { row } of plan.companies) if (row.externalId && belongs(plan, row.externalId)) bucket(row.externalId).company = row;
  for (const { row } of plan.facilities) if (belongs(plan, row.companyExternalId)) bucket(row.companyExternalId).facilities.push(row);
  for (const { row } of plan.products) if (belongs(plan, row.companyExternalId)) bucket(row.companyExternalId).products.push(row);
  for (const { row } of plan.filings) if (belongs(plan, row.companyExternalId)) bucket(row.companyExternalId).filings.push(row);
  for (const { row } of plan.contacts) if (belongs(plan, row.companyExternalId)) bucket(row.companyExternalId).contacts.push(row);

  for (const [externalId, group] of byCompany) {
    await prisma.$transaction(
      async (tx) => {
        let orgId = plan.companyIds.get(externalId) || '';

        if (group.company) {
          const { ...data } = group.company;
          if (orgId) {
            await tx.organization.update({ where: { id: orgId }, data });
            updated += 1;
          } else {
            // Created as `draft`, so it lands in the ops verification queue.
            // NOTHING here may write `status: 'verified'` — that is the gate on
            // catalogue visibility and the whole REQUIRES_VERIFIED set.
            const row = await tx.organization.create({ data: { ...data, kind: 'seller', status: 'draft' } });
            orgId = row.id;
            plan.companyIds.set(externalId, orgId);
            created += 1;
          }
        }
        if (!orgId) return;

        for (const f of group.facilities) {
          const { companyExternalId: _c, ...data } = f;
          const match = await tx.site.findFirst({
            where: { orgId, OR: [{ externalId: data.externalId ?? ' ' }, { regulatoryId: data.regulatoryId ?? ' ' }, { name: data.name }] },
            select: { id: true },
          });
          if (match) {
            await tx.site.update({ where: { id: match.id }, data });
            updated += 1;
          } else {
            await tx.site.create({ data: { ...data, orgId, location: [data.city, data.country].filter(Boolean).join(', ') } });
            created += 1;
          }
        }

        for (const p of group.products) {
          // `stockStatus` is non-nullable with a default: an unstated value must
          // leave the column alone rather than write null over a real answer.
          const { companyExternalId: _c, stockStatus, ...rest } = p;
          const data = { ...rest, ...(stockStatus ? { stockStatus } : {}) };
          // `Product_ID` is only unique WITHIN a company — the documented format
          // ends in a per-company sequence, so two suppliers of metformin both
          // produce API-1115704-0001.
          const match = await tx.product.findFirst({
            where: { orgId, OR: [{ externalId: data.externalId ?? ' ' }, { cas: data.cas, name: data.name }] },
            select: { id: true },
          });
          if (match) {
            await tx.product.update({ where: { id: match.id }, data });
            updated += 1;
          } else {
            // Created as a draft: an import publishes nothing. A curator's
            // upload must not put a listing in front of buyers unreviewed.
            await tx.product.create({ data: { ...data, orgId, status: 'draft' } });
            created += 1;
          }
        }

        for (const f of group.filings) {
          const { companyExternalId: _c, ...data } = f;
          const existingFiling = await tx.regulatoryFiling.findUnique({
            where: { orgId_filingType_filingNumber: { orgId, filingType: data.filingType, filingNumber: data.filingNumber } },
            select: { id: true },
          });
          await tx.regulatoryFiling.upsert({
            where: { orgId_filingType_filingNumber: { orgId, filingType: data.filingType, filingNumber: data.filingNumber } },
            create: { ...data, orgId },
            update: data,
          });
          if (existingFiling) updated += 1;
          else created += 1;
        }

        for (const ct of group.contacts) {
          const { companyExternalId: _c, ...data } = ct;
          if (!data.businessEmail) {
            // No natural key to match on, so this can only ever be an insert.
            await tx.contact.create({ data: { ...data, orgId } });
            created += 1;
          } else {
            const existingContact = await tx.contact.findUnique({
              where: { orgId_businessEmail: { orgId, businessEmail: data.businessEmail } },
              select: { id: true },
            });
            await tx.contact.upsert({
              where: { orgId_businessEmail: { orgId, businessEmail: data.businessEmail } },
              create: { ...data, orgId },
              update: data,
            });
            if (existingContact) updated += 1;
            else created += 1;
          }
        }
      },
      { timeout: TX_TIMEOUT_MS, maxWait: TX_MAX_WAIT_MS },
    );
  }

  created += await applyPrices(plan);
  report.totals.created = created;
  report.totals.updated = updated;
  void actorId;
  return report;
}

/**
 * Price observations, outside the per-company transaction.
 *
 * `createMany({ skipDuplicates })` is NOT supported on SQLite — it throws
 * rather than skipping, so a second apply would fail the whole batch. Pre-filter
 * on the `@unique` `sourceRef` instead, which also behaves identically on the
 * Postgres target.
 */
async function applyPrices(plan: ResolvedPlan): Promise<number> {
  const rows = plan.prices.map((p) => p.row);
  if (rows.length === 0) return 0;

  const refs = rows.map((r) => r.sourceRef);
  const seen = new Set(
    (await prisma.priceObservation.findMany({ where: { sourceRef: { in: refs } }, select: { sourceRef: true } })).map((r) => r.sourceRef),
  );

  const fresh = rows.filter((r) => !seen.has(r.sourceRef));
  if (fresh.length === 0) return 0;

  await prisma.priceObservation.createMany({
    data: fresh.map((r) => {
      const { companyExternalId, ...rest } = r;
      return { ...rest, supplierOrgId: companyExternalId ? plan.companyIds.get(companyExternalId) || null : null };
    }),
  });
  return fresh.length;
}

export interface ImportOutcome {
  report: ImportReport;
  runId?: string;
  error?: string;
}

/** Preview: read, map, resolve. Writes nothing but the run row. */
export async function previewImport(buffer: Buffer): Promise<ImportOutcome> {
  let report: ImportReport | undefined;
  const summary = await withRun('import:supplier-catalogue:preview', async () => {
    const plan = await resolvePlan(await parseWorkbook(buffer));
    report = plan.report;
    return { fetched: report.totals.read, inserted: 0, skipped: report.totals.rejected };
  });
  return { report: report ?? emptyReport(), runId: summary.runId, error: summary.error };
}

/** Apply: the same resolution, then the writes. */
export async function applyImport(buffer: Buffer, actorId: string | null): Promise<ImportOutcome> {
  let report: ImportReport | undefined;
  const summary = await withRun('import:supplier-catalogue:apply', async () => {
    const plan = await resolvePlan(await parseWorkbook(buffer));
    report = await applyPlan(plan, actorId);
    return { fetched: report.totals.read, inserted: report.totals.created, skipped: report.totals.rejected };
  });
  return { report: report ?? emptyReport(), runId: summary.runId, error: summary.error };
}

function emptyReport(): ImportReport {
  return { sheets: [], issues: [], needsReview: [], totals: { read: 0, valid: 0, rejected: 0, created: 0, updated: 0 } };
}
