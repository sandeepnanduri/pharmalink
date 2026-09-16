import { describe, it, expect } from 'vitest';
import { validatePartnerOnboarding, parseArchetype, type PartnerOnboardingInput } from './partner-onboarding';
import { PARTNER_ARCHETYPES } from './partner';

const valid: PartnerOnboardingInput = { archetype: 'indentor', regNumber: '27ABCDE1234F1Z5', rateCardAccepted: true };

describe('validatePartnerOnboarding', () => {
  it('accepts a complete submission', () => {
    expect(validatePartnerOnboarding(valid)).toEqual([]);
  });

  it('returns every problem at once, not just the first', () => {
    const issues = validatePartnerOnboarding({ archetype: null, regNumber: null, rateCardAccepted: false });
    expect(issues).toEqual(['archetypeRequired', 'regNumberRequired', 'rateCardNotAccepted']);
  });

  it('rejects an archetype outside the known set', () => {
    expect(validatePartnerOnboarding({ ...valid, archetype: 'freelancer' })).toContain('archetypeRequired');
  });

  it('requires the published rate card to be accepted — no discretionary side-deals (PARTNER-PROGRAM.md §4)', () => {
    expect(validatePartnerOnboarding({ ...valid, rateCardAccepted: false })).toEqual(['rateCardNotAccepted']);
  });

  it('every archetype in the wizard is one validatePartnerOnboarding actually accepts', () => {
    for (const a of PARTNER_ARCHETYPES) {
      expect(validatePartnerOnboarding({ ...valid, archetype: a })).toEqual([]);
    }
  });
});

describe('parseArchetype', () => {
  it('fails closed to null for junk input', () => {
    expect(parseArchetype('made-up')).toBeNull();
    expect(parseArchetype(null)).toBeNull();
    expect(parseArchetype(undefined)).toBeNull();
  });

  it('accepts every known archetype', () => {
    for (const a of PARTNER_ARCHETYPES) {
      expect(parseArchetype(a)).toBe(a);
    }
  });
});
