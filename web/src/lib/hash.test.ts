import { describe, it, expect } from 'vitest';
import { normalizeSha256, shortHash } from './hash';

const H = 'a'.repeat(64);

describe('normalizeSha256', () => {
  it('accepts a clean 64-hex hash', () => {
    expect(normalizeSha256(H)).toBe(H);
  });
  it('strips 0x / sha256: prefixes, whitespace, and lowercases', () => {
    expect(normalizeSha256('0x' + H.toUpperCase())).toBe(H);
    expect(normalizeSha256('  sha256:' + H + '  ')).toBe(H);
  });
  it('rejects wrong length or non-hex', () => {
    expect(normalizeSha256('abc')).toBeNull();
    expect(normalizeSha256('g'.repeat(64))).toBeNull();
    expect(normalizeSha256(null)).toBeNull();
  });
});

describe('shortHash', () => {
  it('abbreviates long hashes', () => {
    expect(shortHash(H)).toBe('aaaaaaaaaa…aaaaaa');
    expect(shortHash('short')).toBe('short');
  });
});
