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
import { REPRESENTATION_SCOPES, MODEL_A_WINDOW_MONTHS, canActFor, eligibleTier, type RepresentationScope } from '@/lib/partner';
import { can } from '@/lib/rbac';
import { generatePartnerCode } from '@/lib/partner-code.server';
import { validatePartnerOnboarding } from '@/lib/partner-onboarding';
import { getActiveRepresentation } from '@/lib/partner-queries';
import { recordChainedEvent } from '@/lib/chain.server';

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
  const panNumber = String(formData.get('panNumber') ?? '').trim() || null;
  const tradeReferences = String(formData.get('tradeReferences') ?? '').trim() || null;
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
        data: { orgId, code: generatePartnerCode(), archetype: archetype!, taxRegistration, panNumber, tradeReferences },
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
    // "Blockchain-logged" (product roadmap Phase 1, step 4): a real
    // hash-chained, tamper-evident entry — see lib/chain.ts's doc comment
    // for what this is and isn't. Best-effort; never blocks the caller.
    void recordChainedEvent('Introduction', introduction.id, 'partner.introduction', actorId, {
      partnerId,
      buyerOrgId,
      supplierOrgId,
      cas,
      rfqId: rfqId ?? null,
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return; // first-claim-wins
    throw err;
  }
}

/**
 * Seals which partner brought `orgId` to the platform, for Model A revenue
 * sharing (PARTNER-PROGRAM.md §3). Called from signupAction right after a
 * new org is created, when the signup form carried a partner's invite code.
 *
 * `partnerCode` is attacker-controlled input from a public query param — an
 * unknown/mistyped code must never block or error the signup, only skip
 * attribution, so a lookup miss is a silent no-op, not an error.
 *
 * Write-once by construction, same first-claim-wins shape as
 * recordIntroductionIfNew above: `PartnerAttribution.orgId` is `@unique`, so
 * a second seal attempt (which cannot happen from signupAction, since an org
 * signs up exactly once, but could in principle be called twice) hits P2002
 * and is swallowed rather than overwriting the sealed partner. Never call
 * `.update()` on a PartnerAttribution — there is deliberately no function in
 * this module that does.
 */
export async function sealAttributionIfNew(
  orgId: string,
  partnerCode: string,
  source: 'invite_link' | 'manual_ops',
  actorId: string
): Promise<void> {
  const partner = await prisma.partner.findUnique({ where: { code: partnerCode }, select: { id: true } });
  if (!partner) return; // unknown/mistyped code — never blocks signup

  const now = new Date();
  const expiresAt = new Date(now.getFullYear(), now.getMonth() + MODEL_A_WINDOW_MONTHS, now.getDate());

  try {
    const attribution = await prisma.partnerAttribution.create({
      data: { orgId, partnerId: partner.id, source, sealedAt: now, expiresAt },
    });
    await audit('partner.attribution.sealed', 'PartnerAttribution', attribution.id, actorId, source);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return; // first-claim-wins
    throw err;
  }
}

/**
 * Deal registration — a partner claims a prospective buyer↔supplier↔molecule
 * combination BEFORE drafting any RFQ/quote, the standard PRM "protect my
 * lead" pattern. Reuses `recordIntroductionIfNew` exactly as-is (same
 * write-once, first-claim-wins guarantee `Introduction.rfqId` already being
 * nullable was built for) — `rfqId` is simply omitted here.
 *
 * Authorization is deliberately looser than the delegated-drafting actions:
 * a partner registering a deal usually has representation over only ONE
 * side (that's the whole point — locking in a lead on the side they
 * already represent, for a counterparty they don't yet). Requiring a live
 * representation with the matching scope on EITHER side, not both, mirrors
 * exactly what createRfqAction/submitQuoteAction each individually require.
 */
export async function registerDealAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await currentUser();
  if (!user?.orgId) return { error: 'unauthorized' };

  const buyerOrgId = String(formData.get('buyerOrgId') ?? '').trim();
  const supplierOrgId = String(formData.get('supplierOrgId') ?? '').trim();
  const cas = String(formData.get('cas') ?? '').trim();
  if (!buyerOrgId || !supplierOrgId || !cas) return { error: 'error' };
  if (buyerOrgId === supplierOrgId) return { error: 'error' };

  const partner = await prisma.partner.findUnique({ where: { orgId: user.orgId }, select: { id: true, status: true } });
  if (!partner || partner.status === 'suspended') return { error: 'unauthorized' };

  const [buyerRep, supplierRep] = await Promise.all([
    getActiveRepresentation(user.orgId, buyerOrgId),
    getActiveRepresentation(user.orgId, supplierOrgId),
  ]);
  const authorized = canActFor(buyerRep, 'rfq_draft') || canActFor(supplierRep, 'quote_draft');
  if (!authorized) return { error: 'unauthorized' };

  await recordIntroductionIfNew(partner.id, buyerOrgId, supplierOrgId, cas, user.id);
  revalidatePath('/[locale]/partner/network', 'page');
  return { ok: true };
}

/**
 * Tier progression (product roadmap Phase 1: Registered → Qualified →
 * Specialist), wired for real — see lib/partner.ts's eligibleTier for the
 * pure decision logic. Called after a Deal is created for this partner's
 * drafted quote/RFQ (lib/actions.ts's acceptQuoteAction) and after an
 * eo_insurance Document upload (app/api/documents/route.ts) — the only two
 * events that can change what a partner is eligible for. Only ever
 * promotes; never throws (best-effort, same discipline as
 * recordChainedEvent — a tier-recompute failure must not fail the action
 * that triggered it).
 */
export async function recomputeTier(partnerId: string, actorId?: string): Promise<void> {
  try {
    const partner = await prisma.partner.findUnique({ where: { id: partnerId }, select: { orgId: true, tier: true, goodStanding: true } });
    if (!partner) return;
    const [completedMandateCount, eoInsuranceCount] = await Promise.all([
      prisma.deal.count({ where: { OR: [{ rfq: { draftedByPartnerId: partnerId } }, { quote: { draftedByPartnerId: partnerId } }] } }),
      prisma.document.count({ where: { orgId: partner.orgId, kind: 'eo_insurance' } }),
    ]);
    const next = eligibleTier(partner.tier as 'registered' | 'qualified' | 'specialist', completedMandateCount, partner.goodStanding, eoInsuranceCount > 0);
    if (next !== partner.tier) {
      await prisma.partner.update({ where: { id: partnerId }, data: { tier: next } });
      await audit('partner.tier.promoted', 'Partner', partnerId, actorId, `${partner.tier} -> ${next}`);
    }
  } catch {
    // Best-effort — see doc comment above.
  }
}

/**
 * Recomputes tier for whichever partner(s) drafted the buyer or seller side
 * of a just-awarded quote. Lives here, not inlined in actions.ts's
 * acceptQuoteAction, deliberately — that function's own source is pinned
 * (actions.partner-boundary.test.ts) to never reference draftedByPartnerId
 * or other delegation-shaped identifiers, since a partner must never grow
 * an accept-side branch there. This is a read-only side-effect on a
 * *different* org's Partner row, triggered *after* the buyer's own award
 * completes — not a delegation branch on the award itself.
 */
export async function recomputeTiersForAwardedDeal(
  quote: { draftedByPartnerId: string | null; rfq: { draftedByPartnerId: string | null } },
  actorId: string
): Promise<void> {
  const partnerIds = new Set([quote.draftedByPartnerId, quote.rfq.draftedByPartnerId].filter((id): id is string => !!id));
  for (const partnerId of partnerIds) {
    void recomputeTier(partnerId, actorId);
  }
}

/**
 * The one place Partner.goodStanding can be toggled — admin:verify-gated,
 * same permission reviewOrgAction already uses (lib/actions.ts). This never
 * demotes a tier already reached (see eligibleTier); it only blocks or
 * unblocks FUTURE promotion. Surfaced on /admin/partners, the only screen
 * that lists already-active partners (the existing admin review queue only
 * shows orgs still pending initial verification).
 */
export async function setPartnerGoodStandingAction(formData: FormData): Promise<void> {
  const user = await currentUser();
  if (!user || !can(user.principal, 'admin:verify')) return;

  const partnerId = String(formData.get('partnerId') ?? '');
  const goodStanding = formData.get('goodStanding') === 'true';
  if (!partnerId) return;

  await prisma.partner.update({ where: { id: partnerId }, data: { goodStanding } });
  await audit(goodStanding ? 'partner.standing.restored' : 'partner.standing.flagged', 'Partner', partnerId, user.id);
  revalidatePath('/[locale]/admin/partners', 'page');
}
