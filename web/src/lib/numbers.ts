/**
 * Numeric spreadsheet-cell parsing — pure, no DB/Next imports.
 *
 * Curated cells that are conceptually numbers arrive carrying units, symbols
 * and prose: `65%`, `$5000`, `≥99.5% (USP 2024)`, `2400 MT/year`,
 * `$4,867 annual DMF fee (2024 FDA rate)`, `< 4 hours (business hours)`.
 * `Number()` returns `NaN` for every one of them, and `filters.ts` already
 * documents what a NaN reaching Prisma looks like: a confusing 500 rather than
 * an ignored value.
 *
 * So extraction is deliberate and lossy, and it only ever runs on a field the
 * spec registry has declared numeric. Two things it will NOT do silently:
 *
 *  - **Ranges.** `45-75` is reported as `number.range`, not read as 45. Taking
 *    the low end of a range and storing it as "the" capacity or "the" purity is
 *    the kind of wrong that no one notices until a buyer relies on it.
 *  - **Out-of-range values.** Bounds reject; they never clamp. Clamping turns a
 *    curator's typo into a plausible number.
 */

export type NumberProblem = 'number.unparseable' | 'number.range' | 'number.outOfRange';

export interface NumberResult {
  /** Null when the cell was deliberately blank. */
  value: number | null;
  problem?: NumberProblem;
}

const BLANK = /^(?:n\/?a|none|nil|tbd|unknown|not applicable|not specified)\b|^[-—–]+$/i;

/** A signed number with optional thousands separators and decimals. */
const NUMBER = /-?\d[\d,]*(?:\.\d+)?/;

/** A second number after a dash or "to", i.e. the cell states a range. */
const RANGE_TAIL = /^\s*(?:-|–|—|\bto\b|\.{2,})\s*-?\d/i;

const BLANK_RESULT: NumberResult = { value: null };

/**
 * Extracts the leading number from a cell.
 *
 * Comparison operators are stripped, so `≥99.5%` reads as 99.5 — the template's
 * own purity format. The operator itself is not preserved here; the full
 * human-readable spec (`≥99.5% (USP 2024)`) stays in its own string column, and
 * this numeric twin exists only so the purity range filter can work.
 */
export function parseNumber(raw: string | number | null | undefined): NumberResult {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? { value: raw } : { value: null, problem: 'number.unparseable' };
  }

  const text = String(raw ?? '').trim();
  if (!text || BLANK.test(text)) return BLANK_RESULT;

  // Drop a leading comparison operator or approximation marker.
  const body = text.replace(/^[≥≤><~≈=]+\s*/, '').replace(/^(?:approx\.?|about|min\.?|max\.?|up to)\s+/i, '');

  const match = NUMBER.exec(body);
  if (!match) return { value: null, problem: 'number.unparseable' };

  const rest = body.slice(match.index + match[0].length);
  if (RANGE_TAIL.test(rest)) return { value: null, problem: 'number.range' };

  const value = Number(match[0].replace(/,/g, ''));
  return Number.isFinite(value) ? { value } : { value: null, problem: 'number.unparseable' };
}

/**
 * `parseNumber` plus inclusive bounds. Out-of-range **rejects**; it does not
 * clamp, because a clamped value is indistinguishable from a real one once it
 * is in the database.
 */
export function parseBounded(
  raw: string | number | null | undefined,
  min: number,
  max: number,
): NumberResult {
  const r = parseNumber(raw);
  if (r.value == null) return r;
  if (r.value < min || r.value > max) return { value: null, problem: 'number.outOfRange' };
  return r;
}

/** A whole number — capacities, counts, years, employees. Fractions are rejected. */
export function parseInteger(
  raw: string | number | null | undefined,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
): NumberResult {
  const r = parseBounded(raw, min, max);
  if (r.value == null) return r;
  return Number.isInteger(r.value) ? r : { value: null, problem: 'number.unparseable' };
}

/** A percentage, 0–100. `65%`, `65`, `Current Utilization 65 %` all read as 65. */
export function parsePercent(raw: string | number | null | undefined): NumberResult {
  return parseBounded(raw, 0, 100);
}
