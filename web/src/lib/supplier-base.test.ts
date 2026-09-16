import { describe, it, expect } from 'vitest';
import { HS_BY_CAS } from './market-data';
import { herfindahl } from './supply-risk';
import {
  canonicalSponsor,
  supplierBaseFrom,
  supplierShares,
  usGenericName,
  type DrugsFdaApplication,
} from './supplier-base';

const app = (application_number: string, sponsor_name: string, status = 'Prescription'): DrugsFdaApplication => ({
  application_number,
  sponsor_name,
  products: [{ marketing_status: status, active_ingredients: [{ name: 'X' }] }],
});

describe('usGenericName', () => {
  it('maps every molecule in HS_BY_CAS, so no molecule silently reports an empty supply base', () => {
    const unmapped = HS_BY_CAS.filter((m) => !usGenericName(m.cas)).map((m) => m.name);
    expect(unmapped).toEqual([]);
  });

  it('translates the INNs that return zero records under their own name', () => {
    // Probed against openFDA: `paracetamol` and `acetylsalicylic acid` both
    // return 0 results. These two are the reason the table exists.
    expect(usGenericName('103-90-2')).toBe('acetaminophen');
    expect(usGenericName('50-78-2')).toBe('aspirin');
  });

  it('is undefined for an unknown CAS rather than guessing', () => {
    expect(usGenericName('0000-00-0')).toBeUndefined();
  });
});

describe('canonicalSponsor', () => {
  it('merges spellings of the same firm that differ only by legal form', () => {
    expect(canonicalSponsor('Strides Pharma Inc.')).toBe(canonicalSponsor('STRIDES PHARMA'));
    expect(canonicalSponsor('Teva Pharmaceuticals USA, Inc.')).toBe(canonicalSponsor('TEVA PHARMACEUTICALS'));
  });

  it('strips stacked legal forms, not just the last one', () => {
    expect(canonicalSponsor('Aurobindo Pharma USA Inc')).toBe('AUROBINDO PHARMA');
  });

  it('does NOT merge distinct firms that share a first word', () => {
    // The reason only legal forms are stripped: dropping descriptive words
    // would collapse these two into "SUN" and invent a monopoly.
    expect(canonicalSponsor('Sun Pharmaceutical Industries')).not.toBe(canonicalSponsor('Sun Chemical'));
  });
});

describe('supplierBaseFrom', () => {
  it('counts application sponsors, not repeated listings of one application', () => {
    const base = supplierBaseFrom('X', 'ibuprofen', [
      app('ANDA1', 'Alpha Labs'),
      app('ANDA1', 'Alpha Labs'), // same application repeated upstream
      app('ANDA2', 'Beta Pharma'),
    ]);
    expect(base.holders.map((h) => h.name)).toEqual(['Alpha Labs', 'Beta Pharma']);
    expect(base.approvalCount).toBe(2);
  });

  it('excludes applications whose products are all discontinued', () => {
    const base = supplierBaseFrom('X', 'ibuprofen', [
      app('ANDA1', 'Alpha Labs'),
      app('ANDA2', 'Ghost Pharma', 'Discontinued'),
    ]);
    expect(base.holders.map((h) => h.name)).toEqual(['Alpha Labs']);
    expect(base.discontinuedApplications).toBe(1);
  });

  it('keeps an application where only some products are discontinued', () => {
    const base = supplierBaseFrom('X', 'ibuprofen', [
      {
        application_number: 'ANDA1',
        sponsor_name: 'Alpha Labs',
        products: [{ marketing_status: 'Discontinued' }, { marketing_status: 'Prescription' }],
      },
    ]);
    expect(base.approvalCount).toBe(1);
    expect(base.discontinuedApplications).toBe(0);
  });

  it('groups a firm spelled several ways into one holder, keeping the first spelling', () => {
    const base = supplierBaseFrom('X', 'ibuprofen', [
      app('ANDA1', 'Strides Pharma'),
      app('ANDA2', 'STRIDES PHARMA INC.'),
    ]);
    expect(base.holders).toEqual([{ name: 'Strides Pharma', approvals: 2 }]);
  });

  it('never reports basis other than finished_dose — DMF data is not in here', () => {
    expect(supplierBaseFrom('X', 'ibuprofen', [app('ANDA1', 'Alpha')]).basis).toBe('finished_dose');
  });

  it('ignores applications with no sponsor rather than creating a blank holder', () => {
    const base = supplierBaseFrom('X', 'ibuprofen', [app('ANDA1', '   '), app('ANDA2', 'Alpha Labs')]);
    expect(base.holders).toEqual([{ name: 'Alpha Labs', approvals: 1 }]);
  });

  it('is empty, not zero-share, when the molecule has no US approvals', () => {
    const base = supplierBaseFrom('X', 'nothing', []);
    expect(base.holders).toEqual([]);
    expect(base.approvalCount).toBe(0);
    // concentrationOf() then grades this `unknown`, not `single_source`.
    expect(herfindahl(supplierShares(base))).toBe(0);
  });
});

describe('supplierShares', () => {
  it('feeds herfindahl directly, and a lone holder reads as a monopoly', () => {
    const base = supplierBaseFrom('X', 'ibuprofen', [app('ANDA1', 'Alpha Labs')]);
    expect(herfindahl(supplierShares(base))).toBe(10000);
  });

  it('gives four evenly-approved holders the textbook 2500', () => {
    const base = supplierBaseFrom(
      'X',
      'ibuprofen',
      ['A', 'B', 'C', 'D'].map((n, i) => app(`ANDA${i}`, `${n} Labs`)),
    );
    expect(herfindahl(supplierShares(base))).toBe(2500);
  });
});
