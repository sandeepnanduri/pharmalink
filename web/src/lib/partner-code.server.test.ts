import { describe, it, expect } from 'vitest';
import { generatePartnerCode } from './partner-code.server';

describe('generatePartnerCode', () => {
  it('matches the PTR-XXXXXXXX shape', () => {
    expect(generatePartnerCode()).toMatch(/^PTR-[0-9A-F]{8}$/);
  });

  it('is not deterministic', () => {
    expect(generatePartnerCode()).not.toBe(generatePartnerCode());
  });
});
