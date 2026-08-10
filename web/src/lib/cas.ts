/**
 * CAS Registry Number validation — pure, no DB/Next imports.
 *
 * The curation template (READ ME FIRST) makes CAS mandatory on every chemical
 * product and specifies: `Regex: ^\d{2,7}-\d{2}-\d{1}$. Validated using CAS
 * check-digit algorithm.` Both halves matter. The regex alone accepts
 * `1115-70-5`, which is a typo of paracetamol's supplier's metformin and would
 * silently create a second, wrong product row that no filter or price series
 * ever joins to the real one. The check digit catches exactly that class of
 * single-digit and transposition error, which is what hand-curation produces.
 *
 * The algorithm: strip hyphens, take every digit except the last, reverse them,
 * multiply the 1st by 1, the 2nd by 2, and so on, sum, take mod 10. That must
 * equal the last digit.
 */

/** `^\d{2,7}-\d{2}-\d{1}$`, exactly as the template specifies. */
const CAS_SHAPE = /^\d{2,7}-\d{2}-\d$/;

/**
 * Cells that mean "deliberately blank". Curators write these rather than
 * leaving a cell empty, and treating them as a malformed CAS would reject rows
 * that are in fact fine.
 */
const BLANK_TOKENS = new Set(['', 'n/a', 'na', 'none', '-', '—', 'not applicable', 'nil']);

/** The check digit a well-formed CAS body implies, or null if not well-formed. */
export function casCheckDigit(cas: string): number | null {
  if (!CAS_SHAPE.test(cas)) return null;
  const digits = cas.replace(/-/g, '');
  const body = digits.slice(0, -1);
  let sum = 0;
  // Reversed, so the digit adjacent to the check digit carries weight 1.
  for (let i = 0; i < body.length; i += 1) {
    sum += Number(body[body.length - 1 - i]) * (i + 1);
  }
  return sum % 10;
}

/** True only when the shape AND the check digit are both right. */
export function isValidCas(cas: string): boolean {
  const expected = casCheckDigit(cas);
  return expected !== null && expected === Number(cas.slice(-1));
}

export type CasProblem = 'cas.malformed' | 'cas.checkDigit';

export interface CasResult {
  /** The canonical CAS, or null when the cell was deliberately blank. */
  value: string | null;
  /** Set only when the cell held something that was meant to be a CAS and was not. */
  problem?: CasProblem;
}

/**
 * Boundary parser for a spreadsheet cell.
 *
 * Returns `{ value: null }` for a blank cell — the caller decides whether CAS was
 * required on that sheet. Returns a `problem` code (never a throw) for anything
 * that was clearly meant to be a CAS and is not, so the importer can report the
 * exact cell rather than dropping the row silently.
 */
export function parseCas(raw: string | null | undefined): CasResult {
  const trimmed = (raw ?? '').trim();
  if (BLANK_TOKENS.has(trimmed.toLowerCase())) return { value: null };

  // Curators paste "CAS 1115-70-4" and "1115‑70‑4" (with non-ASCII hyphens) often
  // enough that normalising is worth more than a pedantic rejection.
  const normalised = trimmed
    .replace(/^cas[\s:#]*/i, '')
    .replace(/[‐-―−]/g, '-')
    .replace(/\s/g, '');

  if (!CAS_SHAPE.test(normalised)) return { value: null, problem: 'cas.malformed' };
  if (!isValidCas(normalised)) return { value: null, problem: 'cas.checkDigit' };
  return { value: normalised };
}

/**
 * Digits only — `1115-70-4` → `1115704`. Used to build `Product_ID`, whose
 * template format is `[CAT]-[CAS_stripped]-[COMPANY_SEQ]`.
 */
export function stripCas(cas: string): string {
  return cas.replace(/-/g, '');
}
