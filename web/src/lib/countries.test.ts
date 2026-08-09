import { describe, expect, it } from 'vitest';
import { COUNTRIES, canonicalCountryName, countryAlpha3, resolveCountry } from './countries';

describe('the country table itself', () => {
  it('has no duplicate codes or names', () => {
    const a2 = COUNTRIES.map((c) => c.alpha2);
    const a3 = COUNTRIES.map((c) => c.alpha3);
    const names = COUNTRIES.map((c) => c.name);
    expect(new Set(a2).size).toBe(a2.length);
    expect(new Set(a3).size).toBe(a3.length);
    expect(new Set(names).size).toBe(names.length);
  });

  it('uses well-formed codes throughout', () => {
    for (const c of COUNTRIES) {
      expect(c.alpha2, c.name).toMatch(/^[A-Z]{2}$/);
      expect(c.alpha3, c.name).toMatch(/^[A-Z]{3}$/);
      expect(c.name.length, c.alpha2).toBeGreaterThan(1);
    }
  });

  it('lists only alpha-2 codes the platform itself recognises', () => {
    // Catches an invented or mistyped alpha-2 without needing a second hard-coded
    // table to check against.
    const display = new Intl.DisplayNames(['en'], { type: 'region' });
    for (const c of COUNTRIES) {
      expect(display.of(c.alpha2), c.alpha2).not.toBe(c.alpha2);
    }
  });
});

describe('resolveCountry', () => {
  it('accepts all three representations the template mixes', () => {
    expect(canonicalCountryName('India')).toBe('India'); // full name, as the example rows write it
    expect(canonicalCountryName('IN')).toBe('India'); // alpha-2, as the READ ME says
    expect(canonicalCountryName('IND')).toBe('India'); // alpha-3, as Company_ID embeds
  });

  it('resolves the aliases the template actually uses', () => {
    expect(canonicalCountryName('USA')).toBe('United States');
    expect(canonicalCountryName('UK')).toBe('United Kingdom');
    expect(canonicalCountryName('UAE')).toBe('United Arab Emirates');
  });

  it('is case- and whitespace-insensitive', () => {
    expect(canonicalCountryName('  germany  ')).toBe('Germany');
    expect(canonicalCountryName('DEU')).toBe('Germany');
    expect(canonicalCountryName('de')).toBe('Germany');
  });

  it('gives the alpha-3 a Company_ID needs', () => {
    expect(countryAlpha3('India')).toBe('IND');
    expect(countryAlpha3('USA')).toBe('USA');
    expect(countryAlpha3('Germany')).toBe('DEU');
    expect(countryAlpha3('China')).toBe('CHN');
  });

  it('fails closed on anything unrecognised, never guessing', () => {
    expect(resolveCountry('Freedonia')).toBeNull();
    expect(resolveCountry('XX')).toBeNull();
    expect(resolveCountry('')).toBeNull();
    expect(resolveCountry(null)).toBeNull();
    expect(resolveCountry(undefined)).toBeNull();
  });

  it('keeps the countries already in the seed stable', () => {
    // Canonical form is the full English name precisely so these existing
    // Organization.country values keep matching the catalog country facet.
    for (const existing of ['India', 'China', 'Singapore']) {
      expect(canonicalCountryName(existing)).toBe(existing);
    }
  });
});
