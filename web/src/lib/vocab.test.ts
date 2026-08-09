import { describe, expect, it } from 'vitest';
import {
  CONFIDENCE_WEIGHT,
  INCOTERMS,
  confidenceWeight,
  joinMulti,
  outcomeLevel,
  parseCurationStatus,
  parseDataConfidence,
  parseEmaOutcome,
  parseFdaOutcome,
  parseFilingStatus,
  parseIncoterm,
  parseIncoterms,
  parseTriBool,
  splitMulti,
} from './vocab';

describe('splitMulti', () => {
  it('splits the semicolon form the template writes', () => {
    expect(splitMulti('FOB; CIF; DAP; DDP; EXW')).toEqual(['FOB', 'CIF', 'DAP', 'DDP', 'EXW']);
    expect(splitMulti('USA; EU; Japan')).toEqual(['USA', 'EU', 'Japan']);
  });

  it('also handles commas, pipes and newlines', () => {
    expect(splitMulti('API,KSM,Intermediate')).toEqual(['API', 'KSM', 'Intermediate']);
    expect(splitMulti('a|b')).toEqual(['a', 'b']);
    expect(splitMulti('a\nb')).toEqual(['a', 'b']);
  });

  it('keeps a comma that is part of a parenthesised value', () => {
    expect(splitMulti('Yes (ISO 9001:2015, current); No')).toEqual(['Yes (ISO 9001:2015, current)', 'No']);
  });

  it('de-duplicates and drops empties', () => {
    expect(splitMulti('FOB;;FOB; CIF ;')).toEqual(['FOB', 'CIF']);
    expect(splitMulti('')).toEqual([]);
    expect(splitMulti(null)).toEqual([]);
  });
});

describe('joinMulti', () => {
  it('emits the comma-separated form the schema stores', () => {
    expect(joinMulti(['FOB', 'CIF'])).toBe('FOB,CIF');
  });

  it('is null rather than an empty string when there is nothing', () => {
    expect(joinMulti([])).toBeNull();
    expect(joinMulti(['', '  '])).toBeNull();
  });

  it('round-trips a semicolon cell into a comma column', () => {
    expect(joinMulti(splitMulti('FOB; CIF; DAP'))).toBe('FOB,CIF,DAP');
  });
});

describe('incoterms', () => {
  it('covers all ten Incoterms 2020 rules the template requires', () => {
    expect([...INCOTERMS]).toEqual(['EXW', 'FCA', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP']);
  });

  it('parses a code out of surrounding prose', () => {
    expect(parseIncoterm('FOB')).toBe('FOB');
    expect(parseIncoterm('fob nhava sheva')).toBe('FOB');
    expect(parseIncoterm('Ex Works (EXW)')).toBe('EXW');
  });

  it('does not confuse the similar three-letter codes', () => {
    expect(parseIncoterm('CIF')).toBe('CIF');
    expect(parseIncoterm('CFR')).toBe('CFR');
    expect(parseIncoterm('CIP')).toBe('CIP');
    expect(parseIncoterm('CPT')).toBe('CPT');
    expect(parseIncoterm('DPU')).toBe('DPU');
    expect(parseIncoterm('DDP')).toBe('DDP');
  });

  it('fails closed on a non-incoterm', () => {
    expect(parseIncoterm('BEST')).toBeNull();
    expect(parseIncoterm('')).toBeNull();
    expect(parseIncoterm(null)).toBeNull();
  });

  it('parses the multi-value cell and normalises the order', () => {
    // Stored order is canonical EXW→DDP, not the curator's typing order, so two
    // suppliers offering the same terms produce the same column value.
    expect(parseIncoterms('FOB; CIF; DAP; DDP; EXW')).toEqual(['EXW', 'FOB', 'CIF', 'DAP', 'DDP']);
    expect(parseIncoterms('DDP; EXW')).toEqual(['EXW', 'DDP']);
  });

  it('drops unknown members instead of rejecting the whole cell', () => {
    expect(parseIncoterms('FOB; TBD; CIF')).toEqual(['FOB', 'CIF']);
  });
});

describe('data confidence', () => {
  it('reads the label out of the template parenthetical', () => {
    expect(parseDataConfidence('HIGH (PharmaLink Verified)')).toBe('HIGH');
    expect(parseDataConfidence('MEDIUM (Trade data)')).toBe('MEDIUM');
    expect(parseDataConfidence('LOW (Listed price)')).toBe('LOW');
  });

  it('fails closed on anything else', () => {
    expect(parseDataConfidence('VERY HIGH INDEED')).toBe('HIGH'); // contains the word
    expect(parseDataConfidence('probably fine')).toBeNull();
    expect(parseDataConfidence(null)).toBeNull();
  });

  it('maps confidence to the single forecast weight table', () => {
    expect(CONFIDENCE_WEIGHT).toEqual({ HIGH: 1, MEDIUM: 0.6, LOW: 0.3 });
    expect(confidenceWeight('HIGH (PharmaLink Verified)')).toBe(1);
    expect(confidenceWeight('MEDIUM')).toBe(0.6);
    // Unknown confidence must not be treated as trustworthy.
    expect(confidenceWeight('anything else')).toBe(0.3);
  });
});

describe('curation status', () => {
  it('parses the template vocabulary', () => {
    expect(parseCurationStatus('Verified')).toBe('verified');
    expect(parseCurationStatus('Unverified')).toBe('unverified');
    expect(parseCurationStatus('Outdated (>6 months)')).toBe('outdated');
    expect(parseCurationStatus('Flagged')).toBe('flagged');
    expect(parseCurationStatus('Duplicate')).toBe('duplicate');
  });

  it('is null for blank, so a missing cell is not an assertion', () => {
    expect(parseCurationStatus('')).toBeNull();
    expect(parseCurationStatus('   ')).toBeNull();
    expect(parseCurationStatus('probably ok')).toBeNull();
  });
});

describe('inspection outcomes', () => {
  it('parses FDA outcomes out of the template parenthetical', () => {
    expect(parseFdaOutcome('NAI (No Action Indicated)')).toBe('NAI');
    expect(parseFdaOutcome('VAI')).toBe('VAI');
    expect(parseFdaOutcome('OAI — official action indicated')).toBe('OAI');
  });

  it('parses EMA outcomes', () => {
    expect(parseEmaOutcome('Satisfactory')).toBe('Satisfactory');
    expect(parseEmaOutcome('Deficiency noted')).toBe('Deficiency');
    expect(parseEmaOutcome('Refused')).toBe('Refused');
  });

  it('does not read an FDA code out of unrelated text', () => {
    expect(parseFdaOutcome('N/A — NAI, no 483s issued')).toBe('NAI'); // genuinely present
    expect(parseFdaOutcome('none recorded')).toBeNull();
    expect(parseFdaOutcome('CONTAINAI')).toBeNull(); // no word boundary
  });

  it('grades severity, and never calls an unknown outcome ok', () => {
    expect(outcomeLevel('NAI (No Action Indicated)')).toBe('ok');
    expect(outcomeLevel('VAI')).toBe('warning');
    expect(outcomeLevel('OAI')).toBe('critical');
    expect(outcomeLevel('Satisfactory')).toBe('ok');
    expect(outcomeLevel('Deficiency')).toBe('warning');
    expect(outcomeLevel('Refused')).toBe('critical');
    expect(outcomeLevel('')).toBe('unknown');
    expect(outcomeLevel('inspection went well')).toBe('unknown');
  });
});

describe('filing status', () => {
  it('maps the template synonyms onto one active state', () => {
    expect(parseFilingStatus('Active / Current')).toBe('active');
    expect(parseFilingStatus('Current (Active)')).toBe('active');
    expect(parseFilingStatus('Listed (WHO PQ Active)')).toBe('active');
  });

  it('keeps the states that genuinely differ', () => {
    expect(parseFilingStatus('Approved (Active ANDA)')).toBe('approved');
    expect(parseFilingStatus('Pending review')).toBe('pending');
    expect(parseFilingStatus('Withdrawn')).toBe('withdrawn');
    expect(parseFilingStatus('Suspended')).toBe('suspended');
    expect(parseFilingStatus('Expired')).toBe('expired');
  });

  it('prefers the more specific state when a cell says both', () => {
    // "Approved … then withdrawn" must not read as approved.
    expect(parseFilingStatus('Approved 2014, withdrawn 2021')).toBe('withdrawn');
  });

  it('fails closed', () => {
    expect(parseFilingStatus('')).toBeNull();
    expect(parseFilingStatus('looks fine')).toBeNull();
  });
});

describe('parseTriBool', () => {
  it('reads yes and no out of the template parenthetical', () => {
    expect(parseTriBool('Yes (Halal certified)')).toBe(true);
    expect(parseTriBool('Yes (ISO 9001:2015)')).toBe(true);
    expect(parseTriBool('No')).toBe(false);
    expect(parseTriBool('no genotoxic concern')).toBe(false);
  });

  it('keeps unknown distinct from no', () => {
    // The whole point of the tri-state: a buyer filtering for Halal must not be
    // shown an uncurated product, nor have it silently excluded.
    expect(parseTriBool('')).toBeNull();
    expect(parseTriBool('N/A')).toBeNull();
    expect(parseTriBool('TBD')).toBeNull();
    expect(parseTriBool('-')).toBeNull(); // a lone dash is a blank, not a "no"
    expect(parseTriBool('—')).toBeNull();
    expect(parseTriBool(null)).toBeNull();
    expect(parseTriBool('probably')).toBeNull();
  });
});
