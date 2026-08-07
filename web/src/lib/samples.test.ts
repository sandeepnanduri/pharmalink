import { describe, it, expect } from 'vitest';
import { nextSellerSampleStatuses, canSellerSetSample, isTerminalSample } from './samples';

describe('sample-request flow', () => {
  it('offers approve/decline on a new request, ship after approval', () => {
    expect(nextSellerSampleStatuses('requested')).toEqual(['approved', 'declined']);
    expect(nextSellerSampleStatuses('approved')).toEqual(['shipped']);
    expect(nextSellerSampleStatuses('shipped')).toEqual([]);
    expect(nextSellerSampleStatuses('declined')).toEqual([]);
  });
  it('validates transitions', () => {
    expect(canSellerSetSample('requested', 'approved')).toBe(true);
    expect(canSellerSetSample('requested', 'shipped')).toBe(false); // must approve first
    expect(canSellerSetSample('approved', 'shipped')).toBe(true);
    expect(canSellerSetSample('shipped', 'approved')).toBe(false);
  });
  it('knows terminal states', () => {
    expect(isTerminalSample('shipped')).toBe(true);
    expect(isTerminalSample('declined')).toBe(true);
    expect(isTerminalSample('requested')).toBe(false);
  });
});
