import { describe, expect, it } from 'vitest';
import { allFacetOptions } from './taxonomy';
import {
  COLD_CHAIN_VALUES,
  PRODUCT_TYPE_VALUES,
  STOCK_STATUS_VALUES,
  categoryFromProductType,
  formatLeadTime,
  parseColdChain,
  parseLeadTimeDays,
  parseProductType,
  parsePurityPct,
  parseStockStatus,
  productTypeFromCategory,
  readSpecFromForm,
  resolveFacetFor,
  validFacetFor,
} from './product-fields';

describe('productTypeFromCategory', () => {
  it('maps the legacy vocabulary the seed and quick-add form still use', () => {
    expect(productTypeFromCategory('API')).toBe('api');
    expect(productTypeFromCategory('Excipient')).toBe('excipient');
    expect(productTypeFromCategory('KSM')).toBe('ksm');
    expect(productTypeFromCategory('Intermediate')).toBe('intermediate');
  });

  it('defaults to api, matching the column default', () => {
    expect(productTypeFromCategory(null)).toBe('api');
    expect(productTypeFromCategory('something else')).toBe('api');
  });

  it('round-trips back to a legacy category', () => {
    expect(categoryFromProductType('api')).toBe('API');
    expect(categoryFromProductType('excipient')).toBe('Excipient');
  });
});

describe('parseProductType', () => {
  it('accepts a segment id or a legacy category', () => {
    expect(parseProductType('raw_material')).toBe('raw_material');
    expect(parseProductType('Excipient')).toBe('excipient');
    expect(parseProductType('fdf')).toBe('fdf');
  });

  it('fails closed', () => {
    expect(parseProductType('gadget')).toBeNull();
    expect(parseProductType('')).toBeNull();
  });
});

describe('validFacetFor', () => {
  it('accepts a facet that belongs to its segment', () => {
    expect(validFacetFor('api', 'antidiabetic')).toBe('antidiabetic');
    expect(validFacetFor('excipient', 'filler')).toBe('filler');
    expect(validFacetFor('fdf', 'tablet')).toBe('tablet');
  });

  it('rejects a facet from a different segment', () => {
    // No DB constraint ties the two columns, so without this a KSM could carry
    // facet 'tablet' and appear under a dose-form filter.
    expect(validFacetFor('api', 'tablet')).toBeNull();
    expect(validFacetFor('excipient', 'oncology')).toBeNull();
  });

  it('is null for the four segments that have no facet', () => {
    for (const type of ['ksm', 'intermediate', 'raw_material', 'specialty'] as const) {
      expect(validFacetFor(type, 'anything'), type).toBeNull();
    }
  });

  it('is null for a blank facet', () => {
    expect(validFacetFor('api', '')).toBeNull();
    expect(validFacetFor('api', null)).toBeNull();
  });
});

describe('resolveFacetFor', () => {
  it('resolves the labels a curator writes', () => {
    expect(resolveFacetFor('api', 'Antidiabetic')).toBe('antidiabetic');
    expect(resolveFacetFor('excipient', 'Diluent / Filler')).toBe('filler');
    expect(resolveFacetFor('fdf', 'Tablet (IR)')).toBe('tablet');
  });

  it('still refuses a cross-segment match', () => {
    expect(resolveFacetFor('api', 'Tablet')).toBeNull();
  });
});

describe('parseLeadTimeDays', () => {
  it('reads the phrases already in the seed', () => {
    expect(parseLeadTimeDays('2 weeks')).toBe(14);
    expect(parseLeadTimeDays('3 weeks')).toBe(21);
    expect(parseLeadTimeDays('4 weeks')).toBe(28);
    expect(parseLeadTimeDays('10 days')).toBe(10);
  });

  it('takes the UPPER bound of a range', () => {
    // The filter is "maximum lead time". Taking the optimistic end would show a
    // supplier quoting 3–5 weeks to a buyer who asked for 21 days.
    expect(parseLeadTimeDays('2–3 weeks')).toBe(21);
    expect(parseLeadTimeDays('4-5 weeks')).toBe(35);
    expect(parseLeadTimeDays('3 to 4 weeks')).toBe(28);
  });

  it('handles the template abbreviations', () => {
    expect(parseLeadTimeDays('6 wks')).toBe(42);
    expect(parseLeadTimeDays('2 mo')).toBe(60);
  });

  it('refuses a bare number rather than assuming a unit', () => {
    // "4" is four weeks to one supplier and four days to another.
    expect(parseLeadTimeDays('4')).toBeNull();
    expect(parseLeadTimeDays('')).toBeNull();
    expect(parseLeadTimeDays('on request')).toBeNull();
  });

  it('round-trips through the formatter', () => {
    expect(formatLeadTime(21)).toBe('3 weeks');
    expect(formatLeadTime(7)).toBe('1 week');
    expect(formatLeadTime(10)).toBe('10 days');
    expect(formatLeadTime(null)).toBeNull();
    expect(parseLeadTimeDays(formatLeadTime(28))).toBe(28);
  });
});

describe('parsePurityPct', () => {
  it('reads the seed and template purity strings', () => {
    expect(parsePurityPct('99.8%')).toBe(99.8);
    expect(parsePurityPct('≥99.5% (USP 2024)')).toBe(99.5);
    expect(parsePurityPct('NLT 98.0%')).toBe(98);
    expect(parsePurityPct('≥97.0% (dried basis, NF method)')).toBe(97);
  });

  it('rejects a value outside 0–100', () => {
    expect(parsePurityPct('101%')).toBeNull();
    expect(parsePurityPct('0%')).toBeNull();
  });

  it('is null for text with no number', () => {
    expect(parsePurityPct('meets monograph')).toBeNull();
    expect(parsePurityPct('')).toBeNull();
  });
});

describe('parseColdChain', () => {
  it('reads the storage phrases suppliers write', () => {
    expect(parseColdChain('15–25°C, dry')).toBe('ambient');
    expect(parseColdChain('Ambient (15-25°C) Only')).toBe('ambient');
    expect(parseColdChain('Refrigerated 2-8 C')).toBe('refrigerated');
    expect(parseColdChain('Store frozen at -20C')).toBe('frozen');
    expect(parseColdChain('ultra-cold -80')).toBe('ultracold');
  });

  it('is null rather than guessing ambient', () => {
    expect(parseColdChain('as per label')).toBeNull();
    expect(parseColdChain('')).toBeNull();
  });
});

describe('parseStockStatus', () => {
  it('reads the template values', () => {
    expect(parseStockStatus('In Stock')).toBe('in_stock');
    expect(parseStockStatus('Made to Order')).toBe('made_to_order');
    expect(parseStockStatus('Low stock')).toBe('low');
  });

  it('is null for anything else', () => {
    expect(parseStockStatus('ask us')).toBeNull();
  });
});

describe('readSpecFromForm', () => {
  /** A stand-in for FormData: only `get` is used, and absence must be distinct from empty. */
  const form = (values: Record<string, string>) => ({
    get: (k: string) => (k in values ? values[k] : null),
  });

  it('routes registry fields into columns and the blob by what the registry says', () => {
    const out = readSpecFromForm(form({ iupacName: '1,1-Dimethylbiguanide HCl', phRange: '6.68' }), 'api');
    expect(out.iupacName).toBe('1,1-Dimethylbiguanide HCl'); // a real column
    expect(out.specJson).toBe('{"phRange":"6.68"}'); // a blob key
    expect(out).not.toHaveProperty('phRange');
  });

  it('coerces each value to the kind the registry declares', () => {
    const out = readSpecFromForm(
      form({ molecularWeight: '165.62', halal: 'yes', bseTseFree: 'no', qcMethods: 'HPLC; GC; NMR' }),
      'excipient',
    );
    expect(out.molecularWeight).toBe(165.62);
    expect(out.halal).toBe(true);
    expect(out.bseTseFree).toBe(false);
    expect(out.specJson).toContain('"qcMethods":"HPLC,GC,NMR"'); // semicolons normalised
  });

  it('keeps "not stated" distinct from "no" on a tri-state', () => {
    const out = readSpecFromForm(form({ halal: '' }), 'excipient');
    expect(out.halal).toBeNull();
    expect(out.halal).not.toBe(false);
  });

  it('leaves fields absent from the submission alone', () => {
    // The quick-add form posts a handful of fields. It must not null the rest.
    const out = readSpecFromForm(form({ iupacName: 'X' }), 'api');
    expect(Object.keys(out)).toEqual(['iupacName']);
    expect(out).not.toHaveProperty('formula');
  });

  it('does NOT touch specJson when the submission carried no spec fields', () => {
    // Otherwise a quick-add edit serialises an empty object over a spec sheet
    // the seller spent an afternoon on.
    const out = readSpecFromForm(form({ iupacName: 'X' }), 'api');
    expect(out).not.toHaveProperty('specJson');
  });

  it('treats a rendered-but-blank spec field as a deliberate clear', () => {
    const out = readSpecFromForm(form({ phRange: '' }), 'api');
    expect(out.specJson).toBeNull();
  });

  it('ignores fields that do not apply to the segment', () => {
    // `strength` is fdf-only; posting it on a KSM must not write it.
    const out = readSpecFromForm(form({ strength: '500 mg', parentApiCas: '1115-70-4' }), 'ksm');
    expect(out).not.toHaveProperty('strength');
    expect(out.parentApiCas).toBe('1115-70-4');
  });
});

describe('every parser accepts its own canonical output', () => {
  // A CSV export emits the stored value, so a parser that does not recognise
  // what the column holds silently drops the field on re-import. This is the
  // property that caught `in_stock` reading as null.
  it('holds for stock status', () => {
    for (const v of STOCK_STATUS_VALUES) expect(parseStockStatus(v), v).toBe(v);
  });

  it('holds for cold chain', () => {
    for (const v of COLD_CHAIN_VALUES) expect(parseColdChain(v), v).toBe(v);
  });

  it('holds for product type', () => {
    for (const v of PRODUCT_TYPE_VALUES) expect(parseProductType(v), v).toBe(v);
  });

  it('holds for every facet, within its own segment', () => {
    for (const { segment, node } of allFacetOptions()) {
      expect(validFacetFor(segment, node.id), node.id).toBe(node.id);
    }
  });
});
