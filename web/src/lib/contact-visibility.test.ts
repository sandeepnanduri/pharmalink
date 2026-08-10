import { describe, expect, it } from 'vitest';
import { contactTier, fieldsForTier, redactContact, type ViewerContext } from './contact-visibility';

const viewer = (o: Partial<ViewerContext> = {}): ViewerContext => ({
  signedIn: true,
  canBuy: true,
  orgVerified: true,
  hasDeal: false,
  ...o,
});

describe('contactTier', () => {
  it('gives a signed-out visitor the public tier', () => {
    expect(contactTier(viewer({ signedIn: false }))).toBe('public');
  });

  it('gives a verified buyer with no deal the email tier', () => {
    expect(contactTier(viewer())).toBe('email');
  });

  it('gives a verified buyer with a deal the full tier', () => {
    expect(contactTier(viewer({ hasDeal: true }))).toBe('full');
  });

  it('gives an unverified buyer nothing extra', () => {
    // Org verification gates every other privileged action in rbac.ts; a
    // contact directory is not the place to make an exception.
    expect(contactTier(viewer({ orgVerified: false }))).toBe('public');
  });

  it('gives a supplier browsing peers nothing extra', () => {
    expect(contactTier(viewer({ canBuy: false }))).toBe('public');
  });

  it('ignores a deal when the viewer is otherwise ineligible', () => {
    expect(contactTier(viewer({ signedIn: false, hasDeal: true }))).toBe('public');
    expect(contactTier(viewer({ orgVerified: false, hasDeal: true }))).toBe('public');
  });
});

describe('tier fields', () => {
  it('always releases LinkedIn, which the template says is always shown', () => {
    for (const tier of ['public', 'email', 'full'] as const) {
      expect(fieldsForTier(tier).has('linkedinUrl'), tier).toBe(true);
    }
  });

  it('is cumulative', () => {
    expect(fieldsForTier('public').has('businessEmail')).toBe(false);
    expect(fieldsForTier('email').has('businessEmail')).toBe(true);
    expect(fieldsForTier('full').has('businessEmail')).toBe(true);
    expect(fieldsForTier('email').has('mobile')).toBe(false);
    expect(fieldsForTier('full').has('mobile')).toBe(true);
  });

  it('never releases a personal email at any tier', () => {
    // It is not imported at all — this asserts the tiers could not leak it even
    // if a future mapper regressed and started storing it.
    for (const tier of ['public', 'email', 'full'] as const) {
      expect(fieldsForTier(tier).has('personalEmail'), tier).toBe(false);
    }
  });
});

describe('redactContact', () => {
  const contact = {
    id: 'c1',
    firstName: 'Suresh',
    lastName: 'Kumar',
    jobTitle: 'VP — International API Exports',
    linkedinUrl: 'https://linkedin.com/in/example',
    businessEmail: 'suresh@example.test',
    mobile: '+91-98765-43210',
    officePhone: '+91-22-6645-5645',
    responseHours: 4,
    personalEmail: 'private@gmail.test',
  };

  it('removes the value entirely rather than blanking it', () => {
    // The value must never reach the page: hidden in the DOM is still in the
    // RSC payload, in view-source and on the clipboard.
    const publicView = redactContact(contact, 'public');
    expect(publicView).not.toHaveProperty('businessEmail');
    expect(publicView).not.toHaveProperty('mobile');
    expect(Object.values(publicView)).not.toContain('+91-98765-43210');
  });

  it('releases the email tier without the direct lines', () => {
    const v = redactContact(contact, 'email');
    expect(v.businessEmail).toBe('suresh@example.test');
    expect(v).not.toHaveProperty('mobile');
    expect(v).not.toHaveProperty('officePhone');
  });

  it('releases everything at the full tier — except personal data', () => {
    const v = redactContact(contact, 'full');
    expect(v.mobile).toBe('+91-98765-43210');
    expect(v.responseHours).toBe(4);
    expect(v).not.toHaveProperty('personalEmail');
  });

  it('keeps the public identity at every tier', () => {
    for (const tier of ['public', 'email', 'full'] as const) {
      const v = redactContact(contact, tier);
      expect(v.firstName, tier).toBe('Suresh');
      expect(v.linkedinUrl, tier).toBeTruthy();
    }
  });
});
