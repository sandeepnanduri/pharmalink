import { describe, it, expect } from 'vitest';
import { activeCounter, canRespond, canPropose, validCounter } from './negotiation';

const mk = (byOrgId: string, status: string, t: number) => ({ byOrgId, status, createdAt: new Date(t) });

describe('activeCounter', () => {
  it('returns the latest open counter', () => {
    const c = activeCounter([mk('a', 'superseded', 1), mk('a', 'open', 2), mk('b', 'open', 3)]);
    expect(c?.byOrgId).toBe('b');
  });
  it('is null when none are open', () => {
    expect(activeCounter([mk('a', 'accepted', 1)])).toBeNull();
    expect(activeCounter([])).toBeNull();
  });
});

describe('canRespond', () => {
  it('lets the OTHER party respond to an open counter', () => {
    const active = mk('buyer', 'open', 1);
    expect(canRespond(active, 'seller')).toBe(true);
    expect(canRespond(active, 'buyer')).toBe(false); // your own offer
    expect(canRespond(null, 'seller')).toBe(false);
  });
});

describe('canPropose', () => {
  it('allows a fresh proposal when nothing is pending', () => {
    expect(canPropose(null, 'buyer')).toBe(true);
  });
  it('blocks proposing while your own offer is still open', () => {
    expect(canPropose(mk('buyer', 'open', 1), 'buyer')).toBe(false);
    expect(canPropose(mk('seller', 'open', 1), 'buyer')).toBe(true); // you can counter theirs
  });
});

describe('validCounter', () => {
  it('requires a positive price and (if present) positive qty', () => {
    expect(validCounter(14.5)).toBe(true);
    expect(validCounter(14.5, 1000)).toBe(true);
    expect(validCounter(0)).toBe(false);
    expect(validCounter(-1)).toBe(false);
    expect(validCounter(14.5, -5)).toBe(false);
  });
});
