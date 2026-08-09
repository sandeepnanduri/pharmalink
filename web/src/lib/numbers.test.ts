import { describe, expect, it } from 'vitest';
import { parseBounded, parseInteger, parseNumber, parsePercent } from './numbers';

describe('parseNumber', () => {
  it('reads the numbers the template actually writes', () => {
    expect(parseNumber('65%').value).toBe(65);
    expect(parseNumber('$5000').value).toBe(5000);
    expect(parseNumber('$4,867 annual DMF fee (2024 FDA rate)').value).toBe(4867);
    expect(parseNumber('500000000 tablets/year').value).toBe(500_000_000);
    expect(parseNumber('2400 MT/year').value).toBe(2400);
    expect(parseNumber('< 4 hours (business hours)').value).toBe(4);
    expect(parseNumber('≥99.5% (USP 2024)').value).toBe(99.5);
    expect(parseNumber('≤0.5%').value).toBe(0.5);
    expect(parseNumber('0.28-0.33 g/mL').problem).toBe('number.range');
  });

  it('passes a real number through untouched', () => {
    expect(parseNumber(14.8)).toEqual({ value: 14.8 });
    expect(parseNumber(0)).toEqual({ value: 0 });
  });

  it('refuses a range rather than silently taking the low end', () => {
    // Storing 500 as "the" quantity, or 45 as "the" particle size, is the kind
    // of wrong nobody notices until a buyer relies on it.
    expect(parseNumber('45-75')).toEqual({ value: null, problem: 'number.range' });
    expect(parseNumber('45-75 µm')).toEqual({ value: null, problem: 'number.range' });
    expect(parseNumber('500 to 2000')).toEqual({ value: null, problem: 'number.range' });
    expect(parseNumber('5.0–7.5')).toEqual({ value: null, problem: 'number.range' });
  });

  it('takes the first number, so a label containing digits wins', () => {
    // `D50: 45-75 µm` reads as 50, not as a range — the label is indistinguishable
    // from data. This is why extraction only ever runs on a field the spec
    // registry has declared numeric; `particleSize` stays a string column and
    // never reaches here.
    expect(parseNumber('D50: 45-75 µm').value).toBe(50);
  });

  it('treats blanks as absent, not malformed', () => {
    for (const blank of ['', '   ', 'N/A', 'None', 'TBD', '-', '—', 'Not specified']) {
      expect(parseNumber(blank), blank).toEqual({ value: null });
    }
  });

  it('reports a cell with no number at all', () => {
    expect(parseNumber('Achiral')).toEqual({ value: null, problem: 'number.unparseable' });
    expect(parseNumber('In Stock')).toEqual({ value: null, problem: 'number.unparseable' });
  });

  it('handles negatives', () => {
    expect(parseNumber('-46241').value).toBe(-46_241);
  });

  it('never throws', () => {
    expect(() => parseNumber(null)).not.toThrow();
    expect(() => parseNumber(Number.NaN)).not.toThrow();
    expect(parseNumber(Number.NaN).problem).toBe('number.unparseable');
  });
});

describe('parseBounded', () => {
  it('rejects rather than clamps', () => {
    // A clamped value is indistinguishable from a real one once it is stored.
    expect(parseBounded('150', 0, 100)).toEqual({ value: null, problem: 'number.outOfRange' });
    expect(parseBounded('-5', 0, 100)).toEqual({ value: null, problem: 'number.outOfRange' });
  });

  it('accepts the bounds themselves', () => {
    expect(parseBounded('0', 0, 100).value).toBe(0);
    expect(parseBounded('100', 0, 100).value).toBe(100);
  });
});

describe('parseInteger', () => {
  it('accepts whole numbers', () => {
    expect(parseInteger('36000').value).toBe(36_000);
    expect(parseInteger('8 blocks').value).toBe(8);
  });

  it('rejects a fraction where a count is expected', () => {
    expect(parseInteger('2.5').problem).toBe('number.unparseable');
  });
});

describe('parsePercent', () => {
  it('bounds to 0–100', () => {
    expect(parsePercent('65%').value).toBe(65);
    expect(parsePercent('99.5').value).toBe(99.5);
    expect(parsePercent('120%').problem).toBe('number.outOfRange');
  });
});
