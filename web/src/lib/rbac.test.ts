import { describe, it, expect } from 'vitest';
import {
  can,
  denialReason,
  effectivePermissions,
  isVerified,
  isAdmin,
  isStaff,
  isPlatformRole,
  parseRole,
  canBuy,
  canSell,
  type Principal,
} from './rbac';

const verifiedBuyer: Principal = { role: 'buyer', orgStatus: 'verified' };
const pendingBuyer: Principal = { role: 'buyer', orgStatus: 'pending' };
const verifiedSeller: Principal = { role: 'seller', orgStatus: 'verified' };
const pendingSeller: Principal = { role: 'seller', orgStatus: 'pending' };
const both: Principal = { role: 'both', orgStatus: 'verified' };
const admin: Principal = { role: 'admin', orgStatus: null };

describe('verification gate', () => {
  it('lets a verified buyer post an RFQ', () => {
    expect(can(verifiedBuyer, 'rfq:create')).toBe(true);
  });

  it('blocks an unverified buyer from posting an RFQ (two-sided trust, G2)', () => {
    expect(can(pendingBuyer, 'rfq:create')).toBe(false);
    expect(denialReason(pendingBuyer, 'rfq:create')).toBe('unverified');
  });

  it('blocks an unverified seller from quoting', () => {
    expect(can(pendingSeller, 'quote:create')).toBe(false);
    expect(denialReason(pendingSeller, 'quote:create')).toBe('unverified');
  });

  it('blocks an unverified seller from managing listings', () => {
    expect(can(pendingSeller, 'product:manage')).toBe(false);
  });

  it('still allows an unverified user to browse the catalog', () => {
    expect(can(pendingBuyer, 'catalog:read')).toBe(true);
    expect(can(pendingSeller, 'catalog:read')).toBe(true);
  });
});

describe('role gate', () => {
  it('does not let a buyer submit quotes', () => {
    expect(can(verifiedBuyer, 'quote:create')).toBe(false);
    expect(denialReason(verifiedBuyer, 'quote:create')).toBe('role');
  });

  it('does not let a seller post RFQs', () => {
    expect(can(verifiedSeller, 'rfq:create')).toBe(false);
    expect(denialReason(verifiedSeller, 'rfq:create')).toBe('role');
  });

  it('lets a "both" account do both sides', () => {
    expect(can(both, 'rfq:create')).toBe(true);
    expect(can(both, 'quote:create')).toBe(true);
  });

  it('does not let a non-admin verify organizations', () => {
    expect(can(verifiedBuyer, 'admin:verify')).toBe(false);
    expect(can(both, 'admin:verify')).toBe(false);
  });
});

describe('ops staff roles (least privilege)', () => {
  const verifier: Principal = { role: 'verifier', orgStatus: null };
  const productAdmin: Principal = { role: 'product_admin', orgStatus: null };

  it('only the application admin can manage users', () => {
    expect(can(admin, 'admin:users')).toBe(true);
    expect(can(verifier, 'admin:users')).toBe(false);
    expect(can(productAdmin, 'admin:users')).toBe(false);
    expect(can(verifiedBuyer, 'admin:users')).toBe(false);
  });

  it('a verifier can verify orgs but NOT moderate the catalog', () => {
    expect(can(verifier, 'admin:verify')).toBe(true);
    expect(can(verifier, 'admin:moderate')).toBe(false);
  });

  it('a product admin can moderate the catalog but NOT verify orgs', () => {
    expect(can(productAdmin, 'admin:moderate')).toBe(true);
    expect(can(productAdmin, 'admin:verify')).toBe(false);
  });

  it('no staff role can trade', () => {
    for (const p of [admin, verifier, productAdmin]) {
      expect(can(p, 'rfq:create')).toBe(false);
      expect(can(p, 'quote:create')).toBe(false);
      expect(can(p, 'quote:accept')).toBe(false);
    }
  });

  it('staff are not blocked by the org verification gate (they have no org)', () => {
    for (const p of [verifier, productAdmin]) {
      expect(isVerified(p)).toBe(false);
      expect(can(p, 'catalog:read')).toBe(true);
    }
    expect(can(verifier, 'admin:verify')).toBe(true);
    expect(can(productAdmin, 'admin:moderate')).toBe(true);
  });

  it('classifies platform vs trading roles', () => {
    expect(isPlatformRole('admin')).toBe(true);
    expect(isPlatformRole('verifier')).toBe(true);
    expect(isPlatformRole('product_admin')).toBe(true);
    expect(isPlatformRole('buyer')).toBe(false);
    expect(isPlatformRole('both')).toBe(false);
    expect(isStaff(verifier)).toBe(true);
    expect(isStaff(verifiedBuyer)).toBe(false);
  });

  it('isAdmin is reserved for the full admin, not any staff member', () => {
    expect(isAdmin(admin)).toBe(true);
    expect(isAdmin(verifier)).toBe(false);
    expect(isAdmin(productAdmin)).toBe(false);
  });

  it('parses the new staff roles and still fails closed on junk', () => {
    expect(parseRole('verifier')).toBe('verifier');
    expect(parseRole('product_admin')).toBe('product_admin');
    expect(parseRole('superuser')).toBe('buyer'); // least privilege
  });
});

describe('admin', () => {
  it('can verify and moderate without an org of its own', () => {
    expect(can(admin, 'admin:verify')).toBe(true);
    expect(can(admin, 'admin:moderate')).toBe(true);
  });

  it('is not gated on org verification', () => {
    expect(isVerified(admin)).toBe(false);
    expect(can(admin, 'admin:verify')).toBe(true);
  });

  it('cannot post RFQs or quote (platform role, not a trading party)', () => {
    expect(can(admin, 'rfq:create')).toBe(false);
    expect(can(admin, 'quote:create')).toBe(false);
  });
});

describe('denialReason', () => {
  it('returns null when the action is allowed', () => {
    expect(denialReason(verifiedBuyer, 'rfq:create')).toBeNull();
  });
});

describe('effectivePermissions', () => {
  it('drops verification-gated permissions for a pending org', () => {
    const perms = effectivePermissions(pendingBuyer);
    expect(perms.has('catalog:read')).toBe(true);
    expect(perms.has('rfq:create')).toBe(false);
    expect(perms.has('quote:accept')).toBe(false);
  });
});

describe('role helpers', () => {
  it('classifies buy/sell capability', () => {
    expect(canBuy('buyer')).toBe(true);
    expect(canBuy('both')).toBe(true);
    expect(canBuy('seller')).toBe(false);
    expect(canSell('seller')).toBe(true);
    expect(canSell('both')).toBe(true);
    expect(canSell('buyer')).toBe(false);
  });
});
