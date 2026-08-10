import { describe, expect, it } from 'vitest';
import { casCheckDigit, isValidCas, parseCas, stripCas } from './cas';

describe('casCheckDigit', () => {
  it('computes the documented weighted-sum check digit', () => {
    expect(casCheckDigit('1115-70-4')).toBe(4); // metformin HCl, the template's worked example
    expect(casCheckDigit('103-90-2')).toBe(2); // paracetamol
    expect(casCheckDigit('50-00-0')).toBe(0); // formaldehyde — the shortest legal body
    expect(casCheckDigit('15687-27-1')).toBe(1); // ibuprofen
    expect(casCheckDigit('461-58-5')).toBe(5); // dicyandiamide, the template's KSM row
  });

  it('returns null rather than a number for a malformed input', () => {
    expect(casCheckDigit('5-00-0')).toBeNull();
    expect(casCheckDigit('not-a-cas')).toBeNull();
  });
});

describe('isValidCas', () => {
  it('accepts real registry numbers from the template', () => {
    expect(isValidCas('1115-70-4')).toBe(true);
    expect(isValidCas('9004-34-6')).toBe(true); // microcrystalline cellulose — a polymer, still a valid CAS
    expect(isValidCas('50-00-0')).toBe(true);
  });

  it('rejects a single-digit typo that the regex alone would pass', () => {
    expect(isValidCas('1115-70-5')).toBe(false);
  });

  it('rejects a body shorter than the two digits the template allows', () => {
    expect(isValidCas('5-00-0')).toBe(false);
  });

  it('rejects a body longer than seven digits', () => {
    expect(isValidCas('12345678-90-1')).toBe(false);
  });
});

describe('parseCas', () => {
  it('treats deliberately blank cells as absent, not malformed', () => {
    for (const blank of ['', '   ', 'N/A', 'n/a', 'None', '-', 'Not applicable']) {
      expect(parseCas(blank)).toEqual({ value: null });
    }
  });

  it('normalises the prefixes and non-ASCII hyphens curators actually type', () => {
    expect(parseCas('CAS 1115-70-4').value).toBe('1115-70-4');
    expect(parseCas('CAS# 103-90-2').value).toBe('103-90-2');
    expect(parseCas('1115‑70‑4').value).toBe('1115-70-4'); // U+2011 non-breaking hyphen
  });

  it('distinguishes a malformed cell from a failed check digit', () => {
    expect(parseCas('hello')).toEqual({ value: null, problem: 'cas.malformed' });
    expect(parseCas('1115-70-5')).toEqual({ value: null, problem: 'cas.checkDigit' });
  });

  it('never throws', () => {
    expect(() => parseCas(null)).not.toThrow();
    expect(() => parseCas(undefined)).not.toThrow();
  });
});

describe('stripCas', () => {
  it('produces the Product_ID body the template specifies', () => {
    expect(stripCas('1115-70-4')).toBe('1115704');
    expect(stripCas('9004-34-6')).toBe('9004346');
  });
});
