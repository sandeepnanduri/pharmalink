import { describe, it, expect } from 'vitest';
import { nextSellerStatuses, canSellerSet, canBuyerConfirm, isTerminal, statusRank } from './shipment';

describe('shipment status flow', () => {
  it('ranks the pipeline in order', () => {
    expect(statusRank('pending')).toBeLessThan(statusRank('shipped'));
    expect(statusRank('delivered')).toBeLessThan(statusRank('confirmed'));
  });

  it('offers the seller only forward transitions, never "confirmed"', () => {
    expect(nextSellerStatuses('pending')).toEqual(['shipped', 'in_transit', 'delivered']);
    expect(nextSellerStatuses('in_transit')).toEqual(['delivered']);
    expect(nextSellerStatuses('delivered')).toEqual([]);
  });

  it('lets the seller advance but not go backward or to confirmed', () => {
    expect(canSellerSet('pending', 'shipped')).toBe(true);
    expect(canSellerSet('shipped', 'pending')).toBe(false); // no backward
    expect(canSellerSet('delivered', 'confirmed')).toBe(false); // buyer-only
    expect(canSellerSet('pending', 'nonsense')).toBe(false);
  });

  it('lets the buyer confirm only once delivered', () => {
    expect(canBuyerConfirm('delivered')).toBe(true);
    expect(canBuyerConfirm('in_transit')).toBe(false);
    expect(canBuyerConfirm('confirmed')).toBe(false);
  });

  it('treats confirmed as terminal', () => {
    expect(isTerminal('confirmed')).toBe(true);
    expect(isTerminal('delivered')).toBe(false);
  });
});
