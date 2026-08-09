import ExcelJS from 'exceljs';

/**
 * The only place in the app that knows what an `.xlsx` file is.
 *
 * ## Why a library, and why this one
 *
 * This repo has form for hand-rolling: `csv.ts` is dependency-free,
 * `associations.ts` parses HTML by hand, there is no stats library and no UI
 * library. An `.xlsx` is a zip of XML and the happy path is a couple of hundred
 * lines — but Excel date serials, the 1900 leap-year bug, shared-strings versus
 * inline-strings, rich-text runs, merged cells and number-format-dependent
 * typing are each a place where a hand-rolled reader returns a *plausible wrong
 * value* in silence. These cells are compliance data.
 *
 * `exceljs` over SheetJS `xlsx`: the npm-registry copy of the latter is frozen
 * at 0.18.5 carrying prototype pollution (CVE-2023-30533) and ReDoS
 * (CVE-2024-22363), with the fixed builds published only to SheetJS's own CDN.
 * A non-registry entry in `package-lock.json`, in a repo that runs `npm ci` in a
 * Docker build, for a compliance product, is not a trade worth making.
 *
 * ## The wrapper is the point
 *
 * Everything below returns **strings**, keyed by normalised header text, with
 * each value's A1 reference retained. That keeps the nine sheet mappers pure
 * functions over plain objects: unit-testable with no binary fixture, and
 * `exceljs` replaceable in this one file.
 */

/** One cell: its text and where it came from, so an error can name `'2. API Products'!I47`. */
export interface Cell {
  value: string;
  ref: string;
}

export interface SheetRow {
  /** 1-based row number in the sheet, for error messages. */
  rowNumber: number;
  cells: Record<string, Cell>;
}

export interface Sheet {
  name: string;
  /** Normalised header keys, in column order. */
  headers: string[];
  /** The raw header text as written, keyed by normalised header. */
  headerLabels: Record<string, string>;
  rows: SheetRow[];
}

/**
 * Header text → a stable key.
 *
 * Lower-cased, `*` (the template's required-field marker) removed, punctuation
 * collapsed. Mapping by normalised text rather than by column index is not a
 * nicety: the template's header row is row 4 on sheets 3, 4, 5, 7, 8 and 9 but
 * row 5 on sheets 1, 2 and 6, because those three carry an extra merged
 * group-band row (`A — IDENTIFIERS`, `B — PRICE DATA ← FEEDS AI MODEL`). Any
 * reader that assumes a fixed offset reads the band as headers on three sheets.
 */
export function normaliseHeader(text: string): string {
  return text
    .toLowerCase()
    .replace(/\*/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Tokens that identify the real header row while scanning past the banner rows. */
const HEADER_MARKERS = ['company id', 'product id', 'price obs id', 'filing id', 'site id', 'contact id'];

/** How far down to look for the header row before giving up. */
const HEADER_SCAN_DEPTH = 10;

function cellText(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') {
    // Rich text, hyperlinks, formulas and errors all arrive as objects. Take the
    // displayed text; a formula's cached result is what a human sees.
    if ('richText' in v && Array.isArray(v.richText)) return v.richText.map((r) => r.text).join('').trim();
    if ('text' in v && typeof v.text === 'string') return v.text.trim();
    if ('result' in v) return v.result == null ? '' : String(v.result).trim();
    if ('hyperlink' in v && typeof v.hyperlink === 'string') return v.hyperlink.trim();
  }
  return String(v).trim();
}

/** Finds the header row by content, never by offset. Returns null if absent. */
function findHeaderRow(ws: ExcelJS.Worksheet): number | null {
  const depth = Math.min(HEADER_SCAN_DEPTH, ws.rowCount);
  for (let r = 1; r <= depth; r += 1) {
    const texts = (ws.getRow(r).values as unknown[])
      .filter((v): v is NonNullable<unknown> => v != null)
      .map((v) => normaliseHeader(String(v)));
    if (texts.some((t) => HEADER_MARKERS.includes(t))) return r;
  }
  return null;
}

export type SheetProblem = 'sheet.missing' | 'header.notFound';

export interface ReadResult {
  sheet?: Sheet;
  problem?: SheetProblem;
}

/**
 * Reads one worksheet into normalised, string-only rows.
 *
 * A row is skipped when every cell is blank — the template pads its sheets with
 * hundreds of empty rows, and a formula-error row (`-46241` appears a hundred
 * times on sheet 7) is not data either.
 */
export async function readSheet(buffer: ArrayBuffer | Buffer, sheetName: string): Promise<ReadResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as ArrayBuffer);

  // Match on the leading number too — the template names sheets "1. Company
  // Master", and a curator who renames it "Company Master" should still work.
  const target = normaliseHeader(sheetName).replace(/^\d+\s*/, '');
  const ws =
    wb.worksheets.find((w) => normaliseHeader(w.name) === normaliseHeader(sheetName)) ??
    wb.worksheets.find((w) => normaliseHeader(w.name).replace(/^\d+\s*/, '') === target);
  if (!ws) return { problem: 'sheet.missing' };

  const headerRowNumber = findHeaderRow(ws);
  if (headerRowNumber === null) return { problem: 'header.notFound' };

  const headerRow = ws.getRow(headerRowNumber);
  const headers: string[] = [];
  const headerLabels: Record<string, string> = {};
  const columnByHeader = new Map<string, number>();

  headerRow.eachCell({ includeEmpty: false }, (cell, col) => {
    const raw = cellText(cell);
    const key = normaliseHeader(raw);
    if (!key) return;
    // A duplicated header would silently shadow the first column. Keep the
    // first and leave the second unreachable rather than overwriting.
    if (columnByHeader.has(key)) return;
    columnByHeader.set(key, col);
    headers.push(key);
    headerLabels[key] = raw;
  });

  const rows: SheetRow[] = [];
  for (let r = headerRowNumber + 1; r <= ws.rowCount; r += 1) {
    const row = ws.getRow(r);
    const cells: Record<string, Cell> = {};
    let hasValue = false;
    for (const [key, col] of columnByHeader) {
      const cell = row.getCell(col);
      const value = cellText(cell);
      if (value) hasValue = true;
      cells[key] = { value, ref: `${cell.address}` };
    }
    if (hasValue) rows.push({ rowNumber: r, cells });
  }

  return { sheet: { name: ws.name, headers, headerLabels, rows } };
}

/** Every worksheet name in the workbook, for reporting what was found. */
export async function listSheets(buffer: ArrayBuffer | Buffer): Promise<string[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as ArrayBuffer);
  return wb.worksheets.map((w) => w.name);
}

/**
 * Whether these bytes are actually an `.xlsx`.
 *
 * Sniffed, never trusted from `file.type`: browsers routinely send
 * `application/octet-stream` for a spreadsheet, and the field is
 * client-controlled anyway. An `.xlsx` is a zip, so it starts `PK\x03\x04`.
 */
export function looksLikeXlsx(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}
