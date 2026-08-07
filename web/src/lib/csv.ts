/**
 * CSV import/export for the product catalogue — pure + unit tested. A minimal,
 * dependency-free parser sufficient for the seller bulk-upload format:
 *   name,cas,category,grade,purity,moqKg,leadTime,priceMin,priceMax
 */

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
}

export interface ParseResult {
  rows: ProductImportRow[];
  errors: string[];
}

const HEADERS = ['name', 'cas', 'category', 'grade', 'purity', 'moqkg', 'leadtime', 'pricemin', 'pricemax'];

function num(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Parses a products CSV (with header). Rows missing name or CAS are collected as
 * errors, not silently dropped, so the importer can report exactly what failed.
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
  // Map columns by header name when present, else assume the fixed order.
  const idx = (name: string) => (hasHeader ? first.indexOf(name) : HEADERS.indexOf(name));

  dataLines.forEach((line, i) => {
    const cells = splitCsvLine(line);
    const get = (name: string) => {
      const j = idx(name);
      return j >= 0 ? cells[j] : undefined;
    };
    const name = (get('name') ?? '').trim();
    const cas = (get('cas') ?? '').trim();
    if (!name || !cas) {
      errors.push(`row ${i + (hasHeader ? 2 : 1)}: missing name or CAS`);
      return;
    }
    rows.push({
      name,
      cas,
      category: (get('category') ?? 'API').trim() || 'API',
      grade: (get('grade') ?? '').trim() || null,
      purity: (get('purity') ?? '').trim() || null,
      moqKg: num(get('moqkg')) ?? 1,
      leadTime: (get('leadtime') ?? '').trim() || null,
      priceMin: num(get('pricemin')),
      priceMax: num(get('pricemax')),
    });
  });
  return { rows, errors };
}

function csvCell(v: string | number | null | undefined): string {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Serializes products to CSV (with header) for export. */
export function productsToCsv(
  products: { name: string; cas: string; category: string; grade: string | null; purity: string | null; moqKg: number; leadTime: string | null; priceMin: number | null; priceMax: number | null; status: string }[],
): string {
  const header = ['name', 'cas', 'category', 'grade', 'purity', 'moqKg', 'leadTime', 'priceMin', 'priceMax', 'status'];
  const lines = [header.join(',')];
  for (const p of products) {
    lines.push([p.name, p.cas, p.category, p.grade, p.purity, p.moqKg, p.leadTime, p.priceMin, p.priceMax, p.status].map(csvCell).join(','));
  }
  return lines.join('\n');
}
