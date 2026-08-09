import { describe, expect, it } from 'vitest';
import { PRODUCT_TYPES } from './taxonomy';
import {
  SPEC_BLOB_KEYS,
  SPEC_COLUMN_KEYS,
  SPEC_GROUPS,
  allSpecFields,
  fieldsFor,
  groupsFor,
  parseSpec,
  serialiseSpec,
  specCompleteness,
  specField,
} from './product-spec';

describe('the registry is internally consistent', () => {
  it('has no duplicate keys', () => {
    const keys = allSpecFields().map((f) => f.key);
    const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
    expect(dupes, `duplicate spec keys: ${dupes.join(', ')}`).toEqual([]);
  });

  it('never lists a key as both a column and a blob key', () => {
    // The two sets drive different storage. A key in both would be written
    // twice and read from whichever the caller happened to pick.
    const overlap = SPEC_COLUMN_KEYS.filter((k) => SPEC_BLOB_KEYS.includes(k));
    expect(overlap).toEqual([]);
    expect(SPEC_COLUMN_KEYS.length + SPEC_BLOB_KEYS.length).toBe(allSpecFields().length);
  });

  it('gives every field a distinct Chinese label', () => {
    // Labels live here rather than in messages/*.json precisely so the i18n
    // parity test does not demand 140 translations of "Loss on Drying" — but
    // that only holds if they are actually translated.
    for (const f of allSpecFields()) {
      expect(f.labelZh, `${f.key} has no zh label`).toBeTruthy();
      expect(f.labelZh, `${f.key} zh label is the English one`).not.toBe(f.label);
    }
  });

  it('gives every group a distinct Chinese label', () => {
    for (const g of SPEC_GROUPS) {
      expect(g.labelZh, `${g.id} zh label is the English one`).not.toBe(g.label);
    }
  });

  it('uses only known field kinds and scopes fields to real segments', () => {
    const kinds = new Set(['text', 'longtext', 'number', 'bool', 'date', 'list']);
    for (const f of allSpecFields()) {
      expect(kinds.has(f.kind), `${f.key} has kind ${f.kind}`).toBe(true);
      for (const t of f.productTypes ?? []) {
        expect(PRODUCT_TYPES, `${f.key} scopes to unknown segment ${t}`).toContain(t);
      }
    }
  });

  it('looks a field up by key', () => {
    expect(specField('parentApiCas')?.label).toBe('Parent API CAS');
    expect(specField('nope')).toBeUndefined();
  });
});

describe('per-segment views', () => {
  it('gives every segment a non-empty set of groups', () => {
    for (const type of PRODUCT_TYPES) {
      expect(groupsFor(type).length, `${type} has no spec groups`).toBeGreaterThan(0);
    }
  });

  it('shows a KSM its parent API but not a dose form', () => {
    const keys = fieldsFor('ksm').map((f) => f.key);
    expect(keys).toContain('parentApiCas');
    expect(keys).toContain('ichQ11Class');
    expect(keys).not.toContain('strength');
    expect(keys).not.toContain('routeOfAdmin');
  });

  it('shows a finished dose form its formulation but not a synthesis route', () => {
    const keys = fieldsFor('fdf').map((f) => f.key);
    expect(keys).toContain('strength');
    expect(keys).toContain('bioequivalence');
    expect(keys).not.toContain('parentApiCas');
    expect(keys).not.toContain('synthesisRoute');
  });

  it('shows an excipient its dietary certifications', () => {
    const keys = fieldsFor('excipient').map((f) => f.key);
    expect(keys).toContain('halal');
    expect(keys).toContain('bseTseFree');
    expect(keys).toContain('vendorQualStatus');
  });

  it('shows an API its chemistry but not excipient function', () => {
    const keys = fieldsFor('api').map((f) => f.key);
    expect(keys).toContain('iupacName');
    expect(keys).toContain('synthesisRoute');
    expect(keys).not.toContain('functionInFormulation');
    expect(keys).not.toContain('halal');
  });

  it('drops a group entirely when none of its fields apply', () => {
    // Formulation is fdf-only; an API must not be shown an empty section.
    expect(groupsFor('api').map((g) => g.id)).not.toContain('formulation');
    expect(groupsFor('fdf').map((g) => g.id)).toContain('formulation');
  });
});

describe('parseSpec', () => {
  it('reads known keys', () => {
    expect(parseSpec('{"lossOnDrying":"≤0.5%","phRange":"6.68"}')).toEqual({ lossOnDrying: '≤0.5%', phRange: '6.68' });
  });

  it('drops unknown keys rather than storing junk', () => {
    // A blob that accumulates keys nobody can render or export is unusable
    // within two releases.
    expect(parseSpec('{"lossOnDrying":"1%","totallyMadeUp":"x"}')).toEqual({ lossOnDrying: '1%' });
  });

  it('never drops a column-backed key into the blob', () => {
    expect(parseSpec('{"iupacName":"x"}')).toEqual({});
  });

  it('survives anything', () => {
    // A malformed blob must not take out the product page.
    expect(parseSpec(null)).toEqual({});
    expect(parseSpec('')).toEqual({});
    expect(parseSpec('not json')).toEqual({});
    expect(parseSpec('[1,2,3]')).toEqual({});
    expect(parseSpec('"a string"')).toEqual({});
    expect(parseSpec('{"lossOnDrying":{"nested":true}}')).toEqual({});
  });

  it('drops empty values so they render as absent, not blank', () => {
    expect(parseSpec('{"lossOnDrying":"","phRange":"7"}')).toEqual({ phRange: '7' });
  });
});

describe('serialiseSpec', () => {
  it('round-trips', () => {
    const values = { lossOnDrying: '≤0.5%', sdsAvailable: true, gstRate: 12 };
    expect(parseSpec(serialiseSpec(values))).toEqual(values);
  });

  it('is null rather than "{}" when there is nothing to store', () => {
    expect(serialiseSpec({})).toBeNull();
    expect(serialiseSpec({ lossOnDrying: '' })).toBeNull();
  });

  it('drops unknown and column-backed keys', () => {
    expect(serialiseSpec({ madeUp: 'x', iupacName: 'y', phRange: '7' })).toBe('{"phRange":"7"}');
  });

  it('is byte-stable regardless of insertion order', () => {
    // Two products with the same spec must produce identical JSON, or every
    // diff and every idempotent re-import shows a spurious change.
    const a = serialiseSpec({ phRange: '7', lossOnDrying: '1%' });
    const b = serialiseSpec({ lossOnDrying: '1%', phRange: '7' });
    expect(a).toBe(b);
  });
});

describe('specCompleteness', () => {
  it('counts only the fields that apply to the segment', () => {
    // A KSM is not incomplete for lacking a dose form.
    const ksm = specCompleteness('ksm', {}, {});
    const fdf = specCompleteness('fdf', {}, {});
    expect(ksm.total).toBe(fieldsFor('ksm').length);
    expect(fdf.total).toBe(fieldsFor('fdf').length);
    expect(ksm.total).not.toBe(fdf.total);
  });

  it('counts columns and blob values together', () => {
    const empty = specCompleteness('api', {}, {});
    expect(empty.filled).toBe(0);
    expect(empty.pct).toBe(0);

    const partial = specCompleteness('api', { iupacName: 'x', formula: 'C8H9NO2' }, { phRange: '7' });
    expect(partial.filled).toBe(3);
    expect(partial.pct).toBeGreaterThan(0);
    expect(partial.pct).toBeLessThan(100);
  });

  it('ignores empty strings and nulls', () => {
    expect(specCompleteness('api', { iupacName: '', formula: null }, {}).filled).toBe(0);
  });

  it('can reach 100%', () => {
    const fields = fieldsFor('ksm');
    const columns = Object.fromEntries(fields.filter((f) => f.column).map((f) => [f.key, 'x']));
    const spec = Object.fromEntries(fields.filter((f) => !f.column).map((f) => [f.key, 'x']));
    expect(specCompleteness('ksm', columns, spec).pct).toBe(100);
  });
});
