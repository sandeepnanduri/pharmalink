'use server';

/**
 * Sourcing Partner channel — mutations (EPIC N7).
 *
 * Own private `audit()` helper, same convention as actions.ts,
 * content-actions.ts, fulfillment-actions.ts, etc. — `audit()` is not
 * centralized anywhere in this codebase; this is a ninth definition, not an
 * exception to the pattern.
 *
 * Deliberately NOT exported from here: anything that creates or accepts a
 * Deal/Quote. A partner never accepts a quote — that boundary lives in
 * lib/actions.ts's acceptQuoteAction, untouched by this module. See the
 * "PARTNER BOUNDARY" comment there.
 */
import { revalidatePath } from 'next/cache';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { currentUser } from '@/lib/session';
import { REPRESENTATION_SCOPES, type RepresentationScope } from '@/lib/partner';
import { generatePartnerCode } from '@/lib/partner-code.server';
import { validatePartnerOnboarding } from '@/lib/partner-onboarding';

async function audit(action: string, entity: string, entityId: string, actorId?: string, reason?: string) {
  await prisma.auditLog.create({ data: { action, entity, entityId, actorId: actorId ?? null, reason: reason ?? null } });
}

export type ActionState = { error?: string; ok?: boolean; id?: string; issues?: string[] };

/**
 * Submit for verification (mirrors submitOnboardingAction in actions.ts).
 * The Organization row already exists with kind:'partner' — created at
 * account setup (completeSsoAccountAction/signupAction) exactly like a
 * buyer/seller's — so this updates it and creates the satellite `Partner`
 * row, then queues through the SAME, untouched reviewOrgAction ops path: a
 * partner introduction is a weak signal, same precedent as
 * associations.server.ts's imported orgs (persist() always writes
 * status:'draft').
 */
export async function submitPartnerOnboardingAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await currentUser();
  if (!user?.orgId) return { error: 'unauthorized' };
  const orgId = user.orgId;

  const archetype = String(formData.get('archetype') ?? '').trim() || null;
  const regNumber = String(formData.get('regNumber') ?? '').trim();
  const country = String(formData.get('country') ?? '').trim();
  const city = String(formData.get('city') ?? '').trim() || null;
  const taxRegistration = String(formData.get('taxRegistration') ?? '').trim() || null;
  const sourcingCategories = String(formData.get('sourcingCategories') ?? '').trim() || null;
  const about = String(formData.get('about') ?? '').trim() || null;
  const rateCardAccepted = formData.get('rateCardAccepted') === 'on';

  const issues = validatePartnerOnboarding({ archetype, regNumber: regNumber || null, rateCardAccepted });
  if (issues.length) return { error: issues[0], issues };

  // Idempotent: a second submit (back button, double click) updates the org
  // again but never creates a second Partner row.
  const existing = await prisma.partner.findUnique({ where: { orgId } });
  if (existing) return { ok: true, id: existing.id };

  await prisma.organization.update({
    where: { id: orgId },
    data: { regNumber, city, country: country || undefined, sourcingCategories, about, status: 'pending' },
  });

  let partner;
  // Vanishingly unlikely, but a code collision must not surface as a 500.
  for (let attempt = 0; attempt < 5 && !partner; attempt++) {
    try {
      partner = await prisma.partner.create({
        data: { orgId, code: generatePartnerCode(), archetype: archetype!, taxRegistration },
      });
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') throw err;
    }
  }
  if (!partner) return { error: 'error' };

  await audit('partner.submitted', 'Partner', partner.id, user.id);
  await audit('org.submitted', 'Organization', orgId, user.id);
  revalidatePath('/', 'layout');
  return { ok: true, id: partner.id };
}

/**
 * A represented org grants a partner named scopes over itself. Re-granting
 * (partner code already has a row for this org) clears any prior revocation
 * rather than creating a second row — the schema's `@@unique([partnerId,
 * orgId])` makes this the only shape possible, which is deliberate: full
 * grant/revoke history lives on one row, never scattered across many.
 *
 * Caller must be a member of the ORG GRANTING — never the partner itself;
 * consent is the principal's to give.
 */
export async function grantRepresentationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await currentUser();
  if (!user?.orgId) return { error: 'unauthorized' };

  const partnerCode = String(formData.get('partnerCode') ?? '').trim();
  if (!partnerCode) return { error: 'error' };

  const scopes = formData
    .getAll('scopes')
    .map(String)
    .filter((s): s is RepresentationScope => (REPRESENTATION_SCOPES as readonly string[]).includes(s));
  if (scopes.length === 0) return { error: 'scopesRequired' };

  const partner = await prisma.partner.findUnique({ where: { code: partnerCode }, select: { id: true, status: true, orgId: true } });
  if (!partner || partner.status === 'suspended') return { error: 'partnerNotFound' };
  // A partner's own org must never appear as one of its own represented
  // orgs — that would fabricate a client with no real consent behind it and
  // inflate the represented-org count shown on its public profile.
  if (partner.orgId === user.orgId) return { error: 'cannotRepresentSelf' };

  const rep = await prisma.partnerRepresentation.upsert({
    where: { partnerId_orgId: { partnerId: partner.id, orgId: user.orgId } },
    create: {
      partnerId: partner.id,
      orgId: user.orgId,
      scopes: scopes.join(','),
      consentByUserId: user.id,
    },
    update: {
      scopes: scopes.join(','),
      consentAt: new Date(),
      consentByUserId: user.id,
      revokedAt: null,
      revokedByUserId: null,
    },
  });

  await audit('partner.representation.granted', 'PartnerRepresentation', rep.id, user.id);
  return { ok: true, id: rep.id };
}

/** Only the org that granted a representation may revoke it — never the partner. */
export async function revokeRepresentationAction(formData: FormData): Promise<void> {
  const user = await currentUser();
  if (!user?.orgId) return;

  const representationId = String(formData.get('representationId') ?? '');
  const rep = await prisma.partnerRepresentation.findUnique({ where: { id: representationId } });
  if (!rep || rep.orgId !== user.orgId || rep.revokedAt) return;

  await prisma.partnerRepresentation.update({
    where: { id: rep.id },
    data: { revokedAt: new Date(), revokedByUserId: user.id },
  });
  await audit('partner.representation.revoked', 'PartnerRepresentation', rep.id, user.id);
}

/**
 * The anti-bypass artefact (PARTNER-PROGRAM.md §4): records that `partnerId`
 * introduced `buyerOrgId` to `supplierOrgId` for `cas`. Called from
 * createRfqAction/submitQuoteAction in lib/actions.ts right after a
 * partner-drafted write links a buyer org to a supplier org.
 *
 * Write-once by construction: `prisma.introduction.create` either succeeds
 * (first claim) or hits the `@@unique([buyerOrgId, supplierOrgId, cas])`
 * violation (P2002), which is swallowed — a later attempt, by this partner or
 * any other, silently no-ops rather than overwriting the first claimant.
 * Never call `.update()` on an Introduction; there is deliberately no
 * function in this module that does.
 */
export async function recordIntroductionIfNew(
  partnerId: string,
  buyerOrgId: string,
  supplierOrgId: string,
  cas: string,
  actorId: string,
  rfqId?: string
): Promise<void> {
  try {
    const introduction = await prisma.introduction.create({
      data: { partnerId, buyerOrgId, supplierOrgId, cas, rfqId: rfqId ?? null },
    });
    await audit('partner.introduction', 'Introduction', introduction.id, actorId);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return; // first-claim-wins
    throw err;
  }
}
