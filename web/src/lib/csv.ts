/**
 * CSV import/export for the product catalogue — pure + unit tested. A minimal,
 * dependency-free parser for the seller bulk-upload format.
 *
 * This is the **seller self-service** path: paste or upload your own listings,
 * scoped to your own organisation, gated on `product:manage`. It is deliberately
 * kept alongside the ops-side workbook importer rather than replaced by it —
 * forcing a seller to go through an admin console to add ten products would be
 * a regression.
 *
 * The column set was widened from the original nine to cover the fields the
 * catalogue actually filters on. Before that, the CSV path was structurally
 * incapable of producing a listing that appears under a therapeutic-area, dose-
 * form, cold-chain or incoterm filter, because it had nowhere to put the value.
 *
 * Two rules the original had and the wider version keeps:
 *  - **Never silently drop a row.** A row missing name or CAS is reported.
 *  - **Import and export share one column list**, so a seller can export, edit
 *    in a spreadsheet and re-import. Previously export emitted `status` and
 *    import never read it, so a round-trip quietly unpublished nothing and
 *    dropped everything else.
 */

import { parseCas } from './cas';
import {
  parseColdChain,
  parseLeadTimeDays,
  parseProductType,
  parsePurityPct,
  parseStockStatus,
  productTypeFromCategory,
  resolveFacetFor,
  validFacetFor,
} from './product-fields';
import { joinMulti, parseIncoterms } from './vocab';

/** Splits one CSV line, honouring double-quoted fields with embedded commas. */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export interface ProductImportRow {
  name: string;
  cas: string;
  category: string;
  grade: string | null;
  purity: string | null;
  moqKg: number;
  leadTime: string | null;
  priceMin: number | null;
  priceMax: number | null;
  // --- filter-backing columns -----------------------------------------------
  productType: string;
  facet: string | null;
  purityPct: number | null;
  leadTimeDays: number | null;
  incoterms: string | null;
  coldChain: string | null;
  stockStatus: string | null;
  packaging: string | null;
  shelfLife: string | null;
  storage: string | null;
  formula: string | null;
  dmfNumber: string | null;
  cepNumber: string | null;
  asmfNumber: string | null;
  sampleAvailable: boolean;
}

export interface ParseResult {
  rows: ProductImportRow[];
  errors: string[];
}

/**
 * The canonical column order, shared by import and export so a round-trip is
 * lossless. Lower-cased on read, so a header is matched case-insensitively.
 */
export const CSV_COLUMNS = [
  // The original nine, in their original order. A headerless paste is read
  // positionally, so anything inserted here would silently shift a seller's
  // existing file one column to the left.
  'name',
  'cas',
  'category',
  'grade',
  'purity',
  'moqKg',
  'leadTime',
  'priceMin',
  'priceMax',
  // Everything below is appended, never inserted.
  'productType',
  'facet',
  'incoterms',
  'coldChain',
  'stockStatus',
  'packaging',
  'shelfLife',
  'storage',
  'formula',
  'dmfNumber',
  'cepNumber',
  'asmfNumber',
  'sampleAvailable',
] as const;

/**
 * Export carries one extra column: `status`.
 *
 * It is **exported but never imported**, deliberately. A seller needs to see
 * which listings are live, but `importProductsAction` has no live-listing quota
 * check — it creates everything as `draft` precisely so a bulk paste cannot
 * publish past the plan limit. Reading `status` back in would hand any seller a
 * one-paste way around that. The asymmetry is stated here rather than left as
 * the accident it used to be.
 */
export const EXPORT_COLUMNS = [...CSV_COLUMNS, 'status'] as const;

const HEADERS = CSV_COLUMNS.map((c) => c.toLowerCase());

function num(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const bool = (v: string | undefined): boolean => /^(?:1|true|yes|y)$/i.test((v ?? '').trim());

/**
 * Parses a products CSV (with header). Rows missing name or CAS, or carrying a
 * CAS that fails its check digit, are collected as errors rather than silently
 * dropped — the importer reports exactly what failed and why.
 */
export function parseProductsCsv(text: string): ParseResult {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const rows: ProductImportRow[] = [];
  const errors: string[] = [];
  if (lines.length === 0) return { rows, errors: ['emptyFile'] };

  // Detect and skip a header row.
  const first = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const hasHeader = first.includes('name') && first.includes('cas');
  const dataLines = hasHeader ? lines.slice(1) : lines;
  // Map columns by header name when present, else assume the canonical order.
  const idx = (name: string) => (hasHeader ? first.indexOf(name.toLowerCase()) : HEADERS.indexOf(name.toLowerCase()));

  dataLines.forEach((line, i) => {
    const cells = splitCsvLine(line);
    const get = (name: string) => {
      const j = idx(name);
      return j >= 0 ? cells[j] : undefined;
    };
    const rowNumber = i + (hasHeader ? 2 : 1);
    const name = (get('name') ?? '').trim();
    const casCell = (get('cas') ?? '').trim();
    if (!name || !casCell) {
      errors.push(`row ${rowNumber}: missing name or CAS`);
      return;
    }

    // The CAS check digit catches the single-digit typo that would otherwise
    // create a second product no filter and no price series ever joins to.
    const cas = parseCas(casCell);
    if (cas.problem) {
      errors.push(`row ${rowNumber}: ${cas.problem === 'cas.checkDigit' ? 'CAS check digit failed' : 'malformed CAS'} (${casCell})`);
      return;
    }

    const category = (get('category') ?? '').trim();
    const productType = parseProductType(get('producttype')) ?? productTypeFromCategory(category || 'API');
    const facetCell = (get('facet') ?? '').trim();
    const purity = (get('purity') ?? '').trim() || null;
    const leadTime = (get('leadtime') ?? '').trim() || null;
    const storage = (get('storage') ?? '').trim() || null;

    rows.push({
      name,
      cas: cas.value ?? casCell,
      category: category || 'API',
      grade: (get('grade') ?? '').trim() || null,
      purity,
      moqKg: num(get('moqkg')) ?? 1,
      leadTime,
      priceMin: num(get('pricemin')),
      priceMax: num(get('pricemax')),
      productType,
      // Accept a node id or the human label a seller would type.
      facet: validFacetFor(productType, facetCell) ?? resolveFacetFor(productType, facetCell),
      purityPct: parsePurityPct(purity),
      leadTimeDays: parseLeadTimeDays(leadTime),
      incoterms: joinMulti(parseIncoterms(get('incoterms'))),
      coldChain: parseColdChain(get('coldchain') ?? storage),
      stockStatus: parseStockStatus(get('stockstatus')),
      packaging: (get('packaging') ?? '').trim() || null,
      shelfLife: (get('shelflife') ?? '').trim() || null,
      storage,
      formula: (get('formula') ?? '').trim() || null,
      dmfNumber: (get('dmfnumber') ?? '').trim() || null,
      cepNumber: (get('cepnumber') ?? '').trim() || null,
      asmfNumber: (get('asmfnumber') ?? '').trim() || null,
      sampleAvailable: bool(get('sampleavailable')),
    });
  });
  return { rows, errors };
}

function csvCell(v: string | number | boolean | null | undefined): string {
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** What `productsToCsv` needs — a subset of `Product`, so a `select` can satisfy it. */
export type ExportableProduct = {
  [K in (typeof EXPORT_COLUMNS)[number]]?: string | number | boolean | null;
} & { name: string; cas: string };

/**
 * Serializes products to CSV using the same column list the parser reads (plus
 * the read-only `status`), so export → edit → import round-trips without losing
 * a field. Previously export emitted nine columns and import read a different
 * nine, so a round-trip silently discarded everything the seller had set.
 */
export function productsToCsv(products: ExportableProduct[]): string {
  const lines = [EXPORT_COLUMNS.join(',')];
  for (const p of products) {
    lines.push(EXPORT_COLUMNS.map((c) => csvCell(p[c])).join(','));
  }
  return lines.join('\n');
}
