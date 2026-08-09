/**
 * Curated-date parsing and formatting — pure, no DB/Next imports.
 *
 * The template says "Dates in DD-MMM-YYYY format" and then, across its own
 * example rows, uses `01-Jun-2025`, `Apr-2026` (month precision only),
 * `N/A (DMF — no expiry)`, and raw Excel serials wherever a cell happened to be
 * formatted as a date. All four have to work.
 *
 * **Everything is parsed and constructed at UTC midnight.** A local-time parse
 * of `31-Dec-2025` in IST (UTC+5:30) yields 2025-12-30T18:30:00Z, which puts the
 * date in the wrong month and silently shifts every expiry bucket in
 * `compliance.ts` by a day. This is the single most likely way curated dates go
 * quietly wrong, so there is no code path here that touches local time.
 */

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'] as const;

/** Title-case abbreviations for output. Always English — see `formatTemplateDate`. */
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/**
 * `\b` is deliberately only on the word alternatives: a trailing `\b` after `-`
 * never matches at end-of-string, so a lone dash would fall through and be
 * reported as a malformed date.
 */
const BLANK_TOKENS = /^(?:n\/?a|none|nil|tbd|unknown|not applicable)\b|^[-—–]+$/i;

/**
 * Excel stores a date as days since 1899-12-30 (the offset absorbs the famous
 * 1900 leap-year bug, so no separate correction is needed). Bounded to roughly
 * 1954–2119 so a plain small number — a count, a percentage — is never silently
 * read as a date.
 */
const SERIAL_MIN = 20_000;
const SERIAL_MAX = 80_000;
const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);

export type DatePrecision = 'day' | 'month';

export interface TemplateDate {
  /** UTC midnight on the resolved day, or the 1st for month precision. Null when blank. */
  value: Date | null;
  /** Only set when a date was resolved. `month` means the day was never stated. */
  precision?: DatePrecision;
  /** Set when the cell held something meant to be a date and was not. */
  problem?: 'date.unparseable';
}

const utc = (y: number, m: number, d: number): Date => new Date(Date.UTC(y, m, d));

/** Rejects 31-Feb and friends, which `Date.UTC` would silently roll forward. */
function validOrNull(y: number, m: number, d: number): Date | null {
  const date = utc(y, m, d);
  return date.getUTCFullYear() === y && date.getUTCMonth() === m && date.getUTCDate() === d ? date : null;
}

function monthIndex(token: string): number {
  return MONTHS.indexOf(token.slice(0, 3).toLowerCase() as (typeof MONTHS)[number]);
}

const UNPARSEABLE: TemplateDate = { value: null, problem: 'date.unparseable' };

const day = (date: Date | null): TemplateDate => (date ? { value: date, precision: 'day' } : UNPARSEABLE);

/**
 * One matcher per accepted form. A list rather than an if-chain so adding a
 * format is a one-line change and each pattern sits beside the example that
 * justifies it.
 */
const MATCHERS: { pattern: RegExp; read: (m: RegExpExecArray) => TemplateDate }[] = [
  {
    // Excel serial, as a number or as the string a cell reader produced.
    pattern: /^\d+(?:\.\d+)?$/,
    read: (m) => {
      const serial = Number(m[0]);
      // A bare number outside the plausible range is a count, not a date.
      if (serial < SERIAL_MIN || serial > SERIAL_MAX) return UNPARSEABLE;
      return day(new Date(EXCEL_EPOCH_UTC + Math.floor(serial) * 86_400_000));
    },
  },
  {
    // ISO — 2025-06-01, optionally with a time we discard.
    pattern: /^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/,
    read: (m) => day(validOrNull(Number(m[1]), Number(m[2]) - 1, Number(m[3]))),
  },
  {
    // DD-MMM-YYYY — the documented format. Also accepts a space or a slash.
    pattern: /^(\d{1,2})[-\s/]([A-Za-z]{3,9})[-\s/](\d{4})$/,
    read: (m) => day(validOrNull(Number(m[3]), monthIndex(m[2]), Number(m[1]))),
  },
  {
    // MMM-YYYY — month precision, as in the template's `Apr-2026` inspection dates.
    pattern: /^([A-Za-z]{3,9})[-\s/](\d{4})$/,
    read: (m) => {
      const month = monthIndex(m[1]);
      return month < 0 ? UNPARSEABLE : { value: utc(Number(m[2]), month, 1), precision: 'month' };
    },
  },
  {
    // MMM DD, YYYY — "Sep 14, 2025".
    pattern: /^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})$/,
    read: (m) => day(validOrNull(Number(m[3]), monthIndex(m[1]), Number(m[2]))),
  },
];

/**
 * Parses any date form the template produces. Returns `{ value: null }` for a
 * deliberately blank cell and a `problem` code for a cell that was meant to be a
 * date — the caller decides whether the field was required, and the importer
 * reports the exact cell rather than dropping the row.
 *
 * Purely numeric slash/dot forms are refused rather than guessed: `01/06/2025`
 * is 1 June to the curator and 6 January to the FDA, and guessing would corrupt
 * roughly a third of dates with no visible symptom.
 */
export function parseTemplateDate(raw: string | number | Date | null | undefined): TemplateDate {
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return UNPARSEABLE;
    return day(utc(raw.getUTCFullYear(), raw.getUTCMonth(), raw.getUTCDate()));
  }

  const text = String(raw ?? '').trim();
  if (!text || BLANK_TOKENS.test(text)) return { value: null };

  for (const { pattern, read } of MATCHERS) {
    const m = pattern.exec(text);
    if (m) return read(m);
  }
  return UNPARSEABLE;
}

/**
 * DD-MMM-YYYY, always in English.
 *
 * The app formats dates through `getFormatter()`, which renders Chinese month
 * names under `zh`. That is right on screen and wrong in the round-trip export —
 * the template format is not localised, and a `zh` operator's download must
 * still re-import.
 */
export function formatTemplateDate(date: Date | null | undefined, precision: DatePrecision = 'day'): string {
  if (!date || Number.isNaN(date.getTime())) return '';
  const month = MONTH_LABELS[date.getUTCMonth()];
  const year = date.getUTCFullYear();
  if (precision === 'month') return `${month}-${year}`;
  return `${String(date.getUTCDate()).padStart(2, '0')}-${month}-${year}`;
}

/**
 * First of the month at UTC midnight — the anchor for a monthly price series.
 * The M-24…M-1 history columns fan out into rows keyed on the absolute month,
 * and every one of them has to land on the same instant to dedupe.
 */
export function startOfUtcMonth(date: Date): Date {
  return utc(date.getUTCFullYear(), date.getUTCMonth(), 1);
}

/** `2026-04` — the month key used in a fanned-out observation's `sourceRef`. */
export function utcMonthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** `date` shifted back `n` whole months, still at UTC midnight on the 1st. */
export function subtractUtcMonths(date: Date, n: number): Date {
  return utc(date.getUTCFullYear(), date.getUTCMonth() - n, 1);
}
