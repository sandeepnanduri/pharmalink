/**
 * Sourcing Partner onboarding — pure, unit tested, no Prisma and no I/O.
 *
 * Mirrors lib/onboarding.ts's shape: the wizard posts raw strings, this
 * module parses and validates them, and the server action stays a thin
 * persistence layer. Returns every problem at once, never just the first —
 * same reasoning as validateOnboarding: four resubmits to discover four
 * problems teaches people to enter junk to get past the form.
 */
import { PARTNER_ARCHETYPES, type PartnerArchetype } from '@/lib/partner';

export type PartnerOnboardingIssue = 'archetypeRequired' | 'regNumberRequired' | 'rateCardNotAccepted';

export interface PartnerOnboardingInput {
  archetype: string | null;
  regNumber: string | null;
  rateCardAccepted: boolean;
}

export function validatePartnerOnboarding(input: PartnerOnboardingInput): PartnerOnboardingIssue[] {
  const issues: PartnerOnboardingIssue[] = [];

  if (!input.archetype || !(PARTNER_ARCHETYPES as readonly string[]).includes(input.archetype)) {
    issues.push('archetypeRequired');
  }
  if (!input.regNumber) issues.push('regNumberRequired');
  // The rate card is published and identical for every partner (PARTNER-PROGRAM.md
  // §4) — accepting it is what makes a discretionary side-deal impossible later.
  if (!input.rateCardAccepted) issues.push('rateCardNotAccepted');

  return issues;
}

export function parseArchetype(value: string | null | undefined): PartnerArchetype | null {
  return (PARTNER_ARCHETYPES as readonly string[]).includes(value ?? '') ? (value as PartnerArchetype) : null;
}
