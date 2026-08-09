import { describe, expect, it } from 'vitest';
import {
  SequenceAllocator,
  companyExternalId,
  contactExternalId,
  filingExternalId,
  isWellFormedExternalId,
  productExternalId,
  sequenceOf,
  siteExternalId,
} from './external-id';

describe('companyExternalId', () => {
  it('produces the documented SELL-[ISO3]-[NNNN] shape', () => {
    expect(companyExternalId('India', 1)).toBe('SELL-IND-0001');
    expect(companyExternalId('Germany', 42)).toBe('SELL-DEU-0042');
  });

  it('accepts any of the three country representations', () => {
    expect(companyExternalId('IN', 1)).toBe('SELL-IND-0001');
    expect(companyExternalId('IND', 1)).toBe('SELL-IND-0001');
    expect(companyExternalId('USA', 42)).toBe('SELL-USA-0042');
  });

  it('is null rather than a guess when the country is unresolvable', () => {
    expect(companyExternalId('Freedonia', 1)).toBeNull();
    expect(companyExternalId('', 1)).toBeNull();
  });
});

describe('productExternalId', () => {
  it('matches the template example rows', () => {
    expect(productExternalId('api', '1115-70-4', 1)).toBe('API-1115704-0001');
    expect(productExternalId('raw_material', '9004-34-6', 1)).toBe('RAW-9004346-0001');
    expect(productExternalId('excipient', '9004-34-6', 1)).toBe('RAW-9004346-0001');
    expect(productExternalId('fdf', '1115-70-4', 1)).toBe('FDC-1115704-0001');
    expect(productExternalId('ksm', '461-58-5', 1)).toBe('KSM-461585-0001');
    expect(productExternalId('intermediate', '461-58-5', 1)).toBe('KSM-461585-0001');
  });

  it('IS NOT globally unique — two suppliers of one molecule collide', () => {
    // This is why Product.externalId is scoped @@unique([orgId, externalId]).
    // A global unique would throw on the second supplier of metformin.
    const sun = productExternalId('api', '1115-70-4', 1);
    const cipla = productExternalId('api', '1115-70-4', 1);
    expect(sun).toBe(cipla);
  });

  it('is null without a CAS', () => {
    expect(productExternalId('api', null, 1)).toBeNull();
    expect(productExternalId('api', '', 1)).toBeNull();
  });
});

describe('siteExternalId', () => {
  it('keys on the FDA FEI, which the template calls the primary key', () => {
    expect(siteExternalId('India', '3002808027', 1)).toBe('FAC-IND-3002808027');
  });

  it('falls back to a sequence for a site with no FEI', () => {
    expect(siteExternalId('India', null, 3)).toBe('FAC-IND-0003');
    expect(siteExternalId('India', 'N/A', 3)).toBe('FAC-IND-0003');
  });
});

describe('filingExternalId and contactExternalId', () => {
  it('match the template examples', () => {
    expect(filingExternalId(2026, 1)).toBe('RF-2026-0001');
    expect(contactExternalId('India', 1)).toBe('CON-IND-0001');
  });
});

describe('isWellFormedExternalId', () => {
  it('recognises the documented shapes', () => {
    expect(isWellFormedExternalId('company', 'SELL-IND-0001')).toBe(true);
    expect(isWellFormedExternalId('product', 'API-1115704-0001')).toBe(true);
    expect(isWellFormedExternalId('site', 'FAC-IND-3002808027')).toBe(true);
    expect(isWellFormedExternalId('filing', 'RF-2026-0001')).toBe(true);
    expect(isWellFormedExternalId('contact', 'CON-IND-0001')).toBe(true);
  });

  it('rejects a malformed one', () => {
    expect(isWellFormedExternalId('company', 'SELL-INDIA-1')).toBe(false);
    expect(isWellFormedExternalId('product', 'API-1115704')).toBe(false);
    expect(isWellFormedExternalId('company', '')).toBe(false);
  });

  it('is case-insensitive, since the check only warns', () => {
    expect(isWellFormedExternalId('company', 'sell-ind-0001')).toBe(true);
  });
});

describe('SequenceAllocator', () => {
  it('runs a separate series per scope', () => {
    // SELL-IND-0001 and SELL-DEU-0001 both exist and are both first.
    const alloc = new SequenceAllocator();
    expect(alloc.take('IND')).toBe(1);
    expect(alloc.take('DEU')).toBe(1);
    expect(alloc.take('IND')).toBe(2);
    expect(alloc.take('DEU')).toBe(2);
  });

  it('continues an existing series rather than restarting and colliding', () => {
    const alloc = new SequenceAllocator({ IND: 7 });
    expect(alloc.take('IND')).toBe(8);
    expect(alloc.take('DEU')).toBe(1);
  });
});

describe('sequenceOf', () => {
  it('reads the trailing sequence back out', () => {
    expect(sequenceOf('SELL-IND-0042')).toBe(42);
    expect(sequenceOf('API-1115704-0001')).toBe(1);
    expect(sequenceOf('FAC-IND-3002808027')).toBe(3_002_808_027);
  });

  it('is null when there is no trailing number', () => {
    expect(sequenceOf('SELL-IND-ABC')).toBeNull();
    expect(sequenceOf(null)).toBeNull();
  });
});
