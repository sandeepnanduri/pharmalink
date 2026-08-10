import { describe, expect, it } from 'vitest';
import {
  formatTemplateDate,
  parseTemplateDate,
  startOfUtcMonth,
  subtractUtcMonths,
  utcMonthKey,
} from './dates';

const iso = (d: Date | null | undefined) => d?.toISOString() ?? null;

describe('parseTemplateDate', () => {
  it('parses the documented DD-MMM-YYYY form at UTC midnight', () => {
    const r = parseTemplateDate('01-Jun-2025');
    expect(iso(r.value)).toBe('2025-06-01T00:00:00.000Z');
    expect(r.precision).toBe('day');
  });

  it('does not shift the day in a positive-offset timezone', () => {
    // The bug this guards: a local-time parse of 31-Dec-2025 in IST yields
    // 2025-12-30T18:30Z, moving the date into the previous month and silently
    // shifting every compliance expiry bucket.
    expect(iso(parseTemplateDate('31-Dec-2025').value)).toBe('2025-12-31T00:00:00.000Z');
    expect(iso(parseTemplateDate('01-Jan-2026').value)).toBe('2026-01-01T00:00:00.000Z');
  });

  it('parses month precision and says so', () => {
    const r = parseTemplateDate('Apr-2026');
    expect(iso(r.value)).toBe('2026-04-01T00:00:00.000Z');
    expect(r.precision).toBe('month');
  });

  it('parses ISO and "Sep 14, 2025"', () => {
    expect(iso(parseTemplateDate('2025-09-14').value)).toBe('2025-09-14T00:00:00.000Z');
    expect(iso(parseTemplateDate('2025-09-14T11:22:33Z').value)).toBe('2025-09-14T00:00:00.000Z');
    expect(iso(parseTemplateDate('Sep 14, 2025').value)).toBe('2025-09-14T00:00:00.000Z');
  });

  it('parses an Excel serial', () => {
    // 45809 is 01-Jun-2025 on Excel's 1899-12-30 epoch.
    expect(iso(parseTemplateDate(45809).value)).toBe('2025-06-01T00:00:00.000Z');
    expect(iso(parseTemplateDate('45809').value)).toBe('2025-06-01T00:00:00.000Z');
  });

  it('does not read a plain count as a date', () => {
    expect(parseTemplateDate('48')).toEqual({ value: null, problem: 'date.unparseable' });
    expect(parseTemplateDate('2400')).toEqual({ value: null, problem: 'date.unparseable' });
  });

  it('treats the template blanks as absent, not malformed', () => {
    for (const blank of ['', '  ', 'N/A', 'N/A (DMF — no expiry)', 'None', 'TBD', '-']) {
      expect(parseTemplateDate(blank), blank).toEqual({ value: null });
    }
  });

  it('refuses ambiguous numeric forms rather than guessing', () => {
    // 01/06/2025 is 1 June to the curator and 6 January to the FDA. Guessing
    // would corrupt roughly a third of dates with no visible symptom.
    expect(parseTemplateDate('01/06/2025')).toEqual({ value: null, problem: 'date.unparseable' });
    expect(parseTemplateDate('1.6.2025')).toEqual({ value: null, problem: 'date.unparseable' });
  });

  it('rejects impossible calendar dates instead of rolling them forward', () => {
    expect(parseTemplateDate('31-Feb-2025')).toEqual({ value: null, problem: 'date.unparseable' });
    expect(parseTemplateDate('2025-02-30')).toEqual({ value: null, problem: 'date.unparseable' });
  });

  it('rejects an unknown month name', () => {
    expect(parseTemplateDate('01-Xyz-2025')).toEqual({ value: null, problem: 'date.unparseable' });
  });

  it('accepts a Date instance, normalising it to UTC midnight', () => {
    const r = parseTemplateDate(new Date('2025-06-01T18:45:00Z'));
    expect(iso(r.value)).toBe('2025-06-01T00:00:00.000Z');
  });

  it('never throws', () => {
    expect(() => parseTemplateDate(null)).not.toThrow();
    expect(() => parseTemplateDate(new Date('nonsense'))).not.toThrow();
  });
});

describe('formatTemplateDate', () => {
  it('emits DD-MMM-YYYY', () => {
    expect(formatTemplateDate(new Date('2025-06-01T00:00:00Z'))).toBe('01-Jun-2025');
    expect(formatTemplateDate(new Date('2025-12-31T00:00:00Z'))).toBe('31-Dec-2025');
  });

  it('emits MMM-YYYY at month precision', () => {
    expect(formatTemplateDate(new Date('2026-04-01T00:00:00Z'), 'month')).toBe('Apr-2026');
  });

  it('is English regardless of the ambient locale', () => {
    // The export must re-import; a Chinese month name would not.
    expect(formatTemplateDate(new Date('2025-09-14T00:00:00Z'))).toMatch(/^14-Sep-2025$/);
  });

  it('round-trips through the parser', () => {
    const out = formatTemplateDate(new Date('2025-06-01T00:00:00Z'));
    expect(parseTemplateDate(out).value?.toISOString()).toBe('2025-06-01T00:00:00.000Z');
  });

  it('is an empty string for nothing, not "Invalid Date"', () => {
    expect(formatTemplateDate(null)).toBe('');
    expect(formatTemplateDate(new Date('nonsense'))).toBe('');
  });
});

describe('month helpers for the price fan-out', () => {
  it('anchors on the first of the month at UTC midnight', () => {
    expect(iso(startOfUtcMonth(new Date('2025-06-17T09:00:00Z')))).toBe('2025-06-01T00:00:00.000Z');
  });

  it('keys a month unambiguously', () => {
    expect(utcMonthKey(new Date('2025-06-01T00:00:00Z'))).toBe('2025-06');
    expect(utcMonthKey(new Date('2025-11-01T00:00:00Z'))).toBe('2025-11');
  });

  it('subtracts months across a year boundary', () => {
    const base = new Date('2026-01-15T00:00:00Z');
    expect(utcMonthKey(subtractUtcMonths(base, 1))).toBe('2025-12');
    expect(utcMonthKey(subtractUtcMonths(base, 24))).toBe('2024-01');
  });

  it('gives 24 distinct months for a full history fan-out', () => {
    const observed = new Date('2026-06-01T00:00:00Z');
    const keys = Array.from({ length: 24 }, (_, i) => utcMonthKey(subtractUtcMonths(observed, i + 1)));
    expect(new Set(keys).size).toBe(24);
    expect(keys[0]).toBe('2026-05'); // M-1
    expect(keys[23]).toBe('2024-06'); // M-24
  });
});
