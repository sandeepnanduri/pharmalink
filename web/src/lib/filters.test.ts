import { describe, it, expect } from 'vitest';
import { FILTER_SECTIONS, QUICK_CHIPS, activeCount, assertBacked, parseFilters, sectionByKey, toQuery } from './filters';
import { SEGMENTS, resolveFacet, resolveSegment, segment } from './taxonomy';

describe('taxonomy', () => {
  it('covers the five segments the team named', () => {
    for (const t of ['api', 'ksm', 'raw_material', 'excipient', 'fdf']) {
      expect(segment(t), t).toBeDefined();
    }
  });

  it('gives every segment a scope sentence, so the filter can explain itself', () => {
    for (const s of SEGMENTS) {
      expect(s.scope.length, s.type).toBeGreaterThan(20);
      expect(s.synonyms.length, s.type).toBeGreaterThan(0);
    }
  });

  it('resolves the search terms buyers actually type', () => {
    expect(resolveSegment('API')?.type).toBe('api');
    expect(resolveSegment('bulk drug')?.type).toBe('api');
    expect(resolveSegment('Key Starting Material')?.type).toBe('ksm');
    expect(resolveSegment('pharma raw material')?.type).toBe('raw_material');
    expect(resolveSegment('excipients')?.type).toBe('excipient');
    expect(resolveSegment('finished dose')?.type).toBe('fdf');
  });

  it('prefers the longest synonym so a specific term beats a generic one', () => {
    // "key starting material" contains "material"; the specific one must win.
    expect(resolveSegment('key starting material')?.type).toBe('ksm');
  });

  it('returns null rather than guessing on an unrelated term', () => {
    expect(resolveSegment('bicycle')).toBeNull();
    expect(resolveSegment('')).toBeNull();
  });

  it('resolves facets like therapeutic area and dose form', () => {
    expect(resolveFacet('oncology')?.node.id).toBe('oncology');
    expect(resolveFacet('softgel')?.node.id).toBe('capsule-soft');
    expect(resolveFacet('microcrystalline cellulose')?.node.id).toBe('filler');
  });
});

describe('filter sections', () => {
  it('every section declares what backs it', () => {
    expect(() => assertBacked()).not.toThrow();
    for (const s of FILTER_SECTIONS) expect(['verified', 'declared', 'derived']).toContain(s.backing);
  });

  it('throws if a section is registered without a backing', () => {
    // @ts-expect-error deliberately malformed
    expect(() => assertBacked([{ key: 'x', label: 'x', kind: 'multi' }])).toThrow(/without a backing/);
  });

  it('puts certification above price — compliance is not a nice-to-have', () => {
    const keys = FILTER_SECTIONS.map((s) => s.key);
    expect(keys.indexOf('cert')).toBeLessThan(keys.indexOf('price'));
    expect(keys.indexOf('filing')).toBeLessThan(keys.indexOf('price'));
  });

  it('scopes each GMP scheme to the market it governs', () => {
    const certs = sectionByKey('cert')!.options!;
    expect(certs.find((c) => c.value === 'US FDA GMP')!.note).toMatch(/US market/);
    expect(certs.find((c) => c.value === 'EU GMP')!.note).toMatch(/EU/);
    for (const c of certs) expect(c.note, c.value).toBeTruthy();
  });

  it('marks verified-only claims as verified, not declared', () => {
    expect(sectionByKey('cert')!.backing).toBe('verified');
    expect(sectionByKey('filing')!.backing).toBe('verified');
    expect(sectionByKey('noRegulatoryAction')!.backing).toBe('verified');
    // Purity is whatever the supplier's spec sheet says — not independently checked.
    expect(sectionByKey('purity')!.backing).toBe('declared');
  });
});

describe('parseFilters', () => {
  it('reads multi-selects whether they arrive once or many times', () => {
    expect(parseFilters({ cert: 'US FDA GMP' }).cert).toEqual(['US FDA GMP']);
    expect(parseFilters({ cert: ['US FDA GMP', 'EU GMP'] }).cert).toHaveLength(2);
    expect(parseFilters({}).cert).toEqual([]);
  });

  it('clamps numbers into range instead of trusting the URL', () => {
    expect(parseFilters({ purityMin: '150' }).purityMin).toBe(100);
    expect(parseFilters({ purityMin: '-5' }).purityMin).toBe(0);
    expect(parseFilters({ priceMax: '99999999' }).priceMax).toBe(1_000_000);
  });

  it('turns garbage into null, never NaN', () => {
    expect(parseFilters({ priceMin: 'DROP TABLE' }).priceMin).toBeNull();
    expect(parseFilters({ leadTimeMax: '' }).leadTimeMax).toBeNull();
    expect(Number.isNaN(parseFilters({ moqMax: 'abc' }).moqMax as number)).toBe(false);
  });

  it('caps the free-text query so it cannot be used as a payload', () => {
    expect(parseFilters({ q: 'x'.repeat(500) }).q).toHaveLength(120);
  });

  it('falls back to a known sort rather than passing the value through', () => {
    expect(parseFilters({ sort: 'price_low' }).sort).toBe('price_low');
    expect(parseFilters({ sort: '; DELETE FROM' }).sort).toBe('relevance');
  });

  it('reads toggles only from an explicit 1', () => {
    expect(parseFilters({ noRegulatoryAction: '1' }).noRegulatoryAction).toBe(true);
    expect(parseFilters({ noRegulatoryAction: 'true' }).noRegulatoryAction).toBe(false);
    expect(parseFilters({}).noRegulatoryAction).toBe(false);
  });
});

describe('activeCount', () => {
  it('counts every narrowing filter, so "clear all" knows it has work', () => {
    const f = parseFilters({ cert: ['US FDA GMP', 'EU GMP'], purityMin: '99', noRegulatoryAction: '1', q: 'para' });
    expect(activeCount(f)).toBe(5);
  });
  it('is zero for an untouched catalogue', () => {
    expect(activeCount(parseFilters({}))).toBe(0);
  });
  it('does not count the default sort as a filter', () => {
    expect(activeCount(parseFilters({ sort: 'relevance' }))).toBe(0);
  });
});

describe('quick chips', () => {
  it('every chip maps to real filter parameters', () => {
    for (const c of QUICK_CHIPS) {
      const parsed = parseFilters(c.params);
      expect(activeCount(parsed), c.id).toBeGreaterThan(0);
    }
  });
  it('omits chips the platform cannot back with data', () => {
    const ids = QUICK_CHIPS.map((c) => c.id);
    // No rating or supplier-tier data exists yet, so no "Top rated"/"Platinum".
    expect(ids).not.toContain('toprated');
    expect(ids).not.toContain('platinum');
  });
});

describe('toQuery', () => {
  it('round-trips through parseFilters', () => {
    const q = toQuery({ cert: ['US FDA GMP'], purityMin: 99, noRegulatoryAction: true });
    const back = parseFilters(Object.fromEntries(new URLSearchParams(q)));
    expect(back.cert).toEqual(['US FDA GMP']);
    expect(back.purityMin).toBe(99);
    expect(back.noRegulatoryAction).toBe(true);
  });
  it('drops empties so a cleared filter leaves no residue in the URL', () => {
    expect(toQuery({ cert: [], q: '', priceMin: null, sampleAvailable: false })).toBe('');
  });
  it('omits the default sort', () => {
    expect(toQuery({ sort: 'relevance' })).toBe('');
    expect(toQuery({ sort: 'price_low' })).toContain('sort=price_low');
  });
});
