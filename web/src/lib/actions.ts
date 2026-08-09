'use server';

/**
 * Server actions — every mutation in the app.
 *
 * Each action re-checks authorization server-side (never trusts the UI) and
 * writes an AuditLog row for sensitive changes (BACKLOG F0.7).
 */
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { currentUser } from '@/lib/session';
import { can, parseRole, isPlatformRole, ASSIGNABLE_STAFF_ROLES } from '@/lib/rbac';
import { canReceiveQuotes, canBeAwarded, canBeCancelled, isQuoteValid } from '@/lib/rfq';
import { generateApiKey, generateWebhookSecret, WEBHOOK_EVENTS } from '@/lib/integrations';
import { dispatchEvent, isSafeWebhookUrl } from '@/lib/integrations.server';
import { API_SCOPES } from '@/lib/integrations.constants';
import { routing } from '@/i18n/routing';
import { isAtLimit, parsePlan, ENTITLEMENTS } from '@/lib/plans';
import { matchSuppliers, type MatchableSeller } from '@/lib/matching';
import { parseSites, parseCredentials, validateOnboarding } from '@/lib/onboarding';
import {
  categoryFromProductType,
  parseColdChain,
  parseLeadTimeDays,
  parseProductType,
  parsePurityPct,
  parseStockStatus,
  productTypeFromCategory,
  readSpecFromForm,
  validFacetFor,
} from '@/lib/product-fields';
import { joinMulti, parseIncoterms } from '@/lib/vocab';

/** Start of the current calendar month — the window RFQ quotas reset on. */
function monthStart(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/**
 * A locale value that came from a form field, constrained to the supported set.
 * Interpolating a raw form value into `redirect(`/${locale}/…`)` would let
 * `locale=//evil.com` produce a protocol-relative off-site redirect.
 */
function safeLocale(value: FormDataEntryValue | null): string {
  const v = String(value ?? 'en');
  return (routing.locales as readonly string[]).includes(v) ? v : 'en';
}

/** Self-serviceable plans. Enterprise is sales-gated and set by ops, not the user. */
const SELF_SERVICE_PLANS = new Set(['free', 'growth']);

/**
 * `error` is a single message key for the common one-problem case.
 * `issues` carries EVERY validation failure so a form can list them together —
 * making someone resubmit four times to discover four problems is how you get
 * people entering junk to get past the form.
 */
export type ActionState = { error?: string; ok?: boolean; id?: string; issues?: string[] };

async function audit(action: string, entity: string, entityId: string, actorId?: string, reason?: string) {
  await prisma.auditLog.create({ data: { action, entity, entityId, actorId: actorId ?? null, reason: reason ?? null } });
}

/**
 * Fan-out a notification to every user of an org (F5.1). In-app is the source of
 * truth; email/WhatsApp dispatch reads these same rows so channels never drift.
 */
async function notifyOrg(
  orgId: string,
  kind: string,
  title: string,
  opts: { body?: string; link?: string; exceptUserId?: string } = {}
) {
  const users = await prisma.user.findMany({
    where: { orgId, active: true, deletedAt: null, ...(opts.exceptUserId ? { id: { not: opts.exceptUserId } } : {}) },
    select: { id: true },
  });
  if (!users.length) return;
  await prisma.notification.createMany({
    data: users.map((u) => ({ userId: u.id, kind, title, body: opts.body ?? null, link: opts.link ?? null })),
  });
}

export async function markNotificationsReadAction(): Promise<void> {
  const user = await currentUser();
  if (!user) return;
  await prisma.notification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath('/[locale]/notifications', 'page');
  revalidatePath('/', 'layout');
}

// --------------------------------------------------------------------------
// Account — available to EVERY signed-in role (trading and staff alike).
// --------------------------------------------------------------------------
export async function updateProfileAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await currentUser();
  if (!user) return { error: 'unauthorized' };

  const name = String(formData.get('name') ?? '').trim();
  if (name.length < 2) return { error: 'nameTooShort' };

  // Email is the account identity (and the SSO join key) — it is deliberately
  // not editable here. Changing it would silently re-point an SSO login.
  await prisma.user.update({ where: { id: user.id }, data: { name } });
  await audit('user.profile.updated', 'User', user.id, user.id);
  revalidatePath('/[locale]/account', 'page');
  revalidatePath('/', 'layout');
  return { ok: true };
}

export async function changePasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await currentUser();
  if (!user) return { error: 'unauthorized' };

  const current = String(formData.get('currentPassword') ?? '');
  const next = String(formData.get('newPassword') ?? '');
  const confirm = String(formData.get('confirmPassword') ?? '');

  if (next !== confirm) return { error: 'passwordMismatch' };
  if (next.length < 10) return { error: 'weakPassword' };

  const db = await prisma.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
  // SSO-only accounts have no local password to change.
  if (!db?.passwordHash) return { error: 'ssoManaged' };

  // Require the CURRENT password: without this, anyone with a stolen session
  // could lock the real owner out of their own account.
  if (!(await bcrypt.compare(current, db.passwordHash))) return { error: 'wrongCurrentPassword' };
  if (await bcrypt.compare(next, db.passwordHash)) return { error: 'samePassword' };

  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(next, 10) } });
  await audit('user.password.changed', 'User', user.id, user.id);
  return { ok: true };
}

/**
 * Company profile — trading organizations only.
 *
 * Note what is NOT here: verification status, plan, and (once verified) the
 * legal name and registration number. Those were checked against an issuing
 * authority; letting a supplier edit them post-verification would let a verified
 * badge be moved onto a different company.
 */
export async function updateCompanyAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await currentUser();
  if (!user?.orgId) return { error: 'unauthorized' };

  const org = await prisma.organization.findUnique({
    where: { id: user.orgId },
    select: { status: true, kind: true },
  });
  if (!org) return { error: 'unauthorized' };

  const locked = org.status === 'verified';
  const name = String(formData.get('name') ?? '').trim();
  const regNumber = String(formData.get('regNumber') ?? '').trim();

  const data: Record<string, string | null> = {
    city: String(formData.get('city') ?? '').trim() || null,
    website: String(formData.get('website') ?? '').trim() || null,
    about: String(formData.get('about') ?? '').trim() || null,
    defaultIncoterm: String(formData.get('defaultIncoterm') ?? '').trim() || null,
    defaultPaymentTerms: String(formData.get('defaultPaymentTerms') ?? '').trim() || null,
    defaultLeadTime: String(formData.get('defaultLeadTime') ?? '').trim() || null,
  };

  if (org.kind === 'seller' || org.kind === 'both') {
    data.exportMarkets = String(formData.get('exportMarkets') ?? '').trim() || null;
    data.dmfNumbers = String(formData.get('dmfNumbers') ?? '').trim() || null;
  }
  if (org.kind === 'buyer' || org.kind === 'both') {
    data.sourcingCategories = String(formData.get('sourcingCategories') ?? '').trim() || null;
    data.regulatoryMarkets = String(formData.get('regulatoryMarkets') ?? '').trim() || null;
    data.preferredOrigins = String(formData.get('preferredOrigins') ?? '').trim() || null;
  }

  // Identity fields stay editable only until ops has verified them.
  if (!locked) {
    if (name.length < 2) return { error: 'nameTooShort' };
    data.name = name;
    data.regNumber = regNumber || null;
  }

  await prisma.organization.update({ where: { id: user.orgId }, data });
  await audit('org.profile.updated', 'Organization', user.orgId, user.id);
  revalidatePath('/[locale]/account', 'page');
  return { ok: true };
}

// --------------------------------------------------------------------------
// Signup (F3.1 / F2.1)
// --------------------------------------------------------------------------
const SignupSchema = z
  .object({
    name: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(10),
    confirm: z.string(),
    company: z.string().min(2),
    country: z.string().min(2),
    role: z.enum(['buyer', 'seller', 'both']),
    terms: z.string().optional(),
    marketing: z.string().optional(),
  })
  .refine((d) => d.password === d.confirm, { message: 'passwordMismatch', path: ['confirm'] })
  .refine((d) => d.terms === 'on', { message: 'mustAcceptTerms', path: ['terms'] });

export async function signupAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = SignupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const known = ['passwordMismatch', 'mustAcceptTerms'];
    if (known.includes(issue.message)) return { error: issue.message };
    if (issue.path[0] === 'password') return { error: 'weakPassword' };
    return { error: 'error' };
  }
  const d = parsed.data;
  const email = d.email.trim().toLowerCase();

  if (await prisma.user.findUnique({ where: { email } })) return { error: 'emailTaken' };

  const org = await prisma.organization.create({
    data: {
      name: d.company,
      kind: d.role,
      status: 'draft',
      country: d.country,
    },
  });

  const user = await prisma.user.create({
    data: {
      email,
      name: d.name,
      passwordHash: await bcrypt.hash(d.password, 10),
      role: d.role,
      orgId: org.id,
      consentTermsAt: new Date(),
      consentPrivacyAt: new Date(),
      consentMarketingAt: d.marketing === 'on' ? new Date() : null,
    },
  });

  await audit('user.registered', 'User', user.id, user.id);
  return { ok: true, id: user.id };
}

const AccountSetupSchema = z
  .object({
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    phone: z.string().max(40).optional(),
    company: z.string().min(2),
    country: z.string().min(2),
    role: z.enum(['buyer', 'seller', 'both']),
    terms: z.string().optional(),
  })
  .refine((d) => d.terms === 'on', { message: 'mustAcceptTerms', path: ['terms'] });

/**
 * Finishes account creation for a user who authenticated via SSO.
 *
 * Google/SAML only give us an email and a name — no company, and no indication
 * of whether the person buys or sells. The adapter therefore creates a User with
 * the schema-default role and NO organization, which every trading surface needs.
 * This collects the missing pieces and creates the organization, putting SSO
 * users in exactly the same state a password signup produces (org 'draft', ready
 * for the verification step).
 */
export async function completeSsoAccountAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await currentUser();
  if (!user) return { error: 'unauthorized' };
  // Idempotent: never let a second submit create a duplicate organization.
  if (user.orgId) return { ok: true, id: user.orgId };

  const parsed = AccountSetupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    if (issue.message === 'mustAcceptTerms') return { error: 'mustAcceptTerms' };
    return { error: 'error' };
  }
  const d = parsed.data;

  const org = await prisma.organization.create({
    data: { name: d.company, kind: d.role, status: 'draft', country: d.country },
  });
  await prisma.user.update({
    where: { id: user.id },
    data: {
      // SSO gives a single display name; setup splits it so we hold a real
      // first/last, plus a contact number the provider never supplies.
      name: `${d.firstName.trim()} ${d.lastName.trim()}`.trim(),
      phone: d.phone?.trim() || null,
      role: d.role,
      orgId: org.id,
      // First user of a brand-new org owns it (billing + team management).
      orgRole: 'owner',
      consentTermsAt: new Date(),
      consentPrivacyAt: new Date(),
    },
  });

  await audit('account.completed', 'Organization', org.id, user.id);
  revalidatePath('/[locale]', 'page');
  return { ok: true, id: org.id };
}

// --------------------------------------------------------------------------
// Onboarding — submit org for verification (F2.5, F3.4)
// --------------------------------------------------------------------------
export async function submitOnboardingAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await currentUser();
  if (!user?.orgId) return { error: 'unauthorized' };

  const orgId = user.orgId;
  const regNumber = String(formData.get('regNumber') ?? '').trim();
  const city = String(formData.get('city') ?? '').trim();
  const companyType = String(formData.get('companyType') ?? '').trim() || null;
  const supplierType = String(formData.get('supplierType') ?? '').trim() || null;
  const exportMarkets = String(formData.get('exportMarkets') ?? '').trim() || null;
  const about = String(formData.get('about') ?? '').trim() || null;

  const sites = parseSites(zipRows(formData, 'site', SITE_FIELDS));
  const credentials = parseCredentials(zipRows(formData, 'cred', CREDENTIAL_FIELDS));

  // All rules live in lib/onboarding.ts so they are unit-testable without a DB.
  // Return every failure, not just the first — the form lists them together.
  const issues = validateOnboarding({ regNumber: regNumber || null, supplierType, sites, credentials });
  if (issues.length) return { error: issues[0], issues };

  // Documents were already uploaded (bytes stored + hashed) — we only link them.
  const documentIds = formData.getAll('documentIds').map(String).filter(Boolean);

  // Every document referenced by a credential must belong to this org. Checked
  // up front so a forged documentId can never be linked to someone else's file.
  const claimedDocIds = credentials.map((c) => c.documentId).filter((d): d is string => !!d);
  const ownedDocIds = new Set(
    claimedDocIds.length
      ? (
          await prisma.document.findMany({
            where: { id: { in: claimedDocIds }, orgId },
            select: { id: true },
          })
        ).map((d) => d.id)
      : [],
  );

  await prisma.organization.update({
    where: { id: orgId },
    data: { regNumber, city, companyType, supplierType, exportMarkets, about, status: 'pending' },
  });

  // Replace prior claims so re-submitting is idempotent. Sites are replaced
  // wholesale too — an applicant removing a site must actually remove it.
  await prisma.site.deleteMany({ where: { orgId } });
  for (const s of sites) {
    await prisma.site.create({ data: { ...s, orgId } });
  }

  await prisma.certification.deleteMany({ where: { orgId, status: 'pending' } });
  for (const c of credentials) {
    await prisma.certification.create({
      data: {
        orgId,
        name: c.name,
        category: c.category,
        number: c.number,
        issuingAuthority: c.issuingAuthority,
        expiresAt: c.expiresAt,
        status: 'pending',
        // The linkage that was missing: a claim now carries its evidence, so a
        // verifier can open the certificate instead of taking the name on trust.
        documentId: c.documentId && ownedDocIds.has(c.documentId) ? c.documentId : null,
      },
    });
  }

  if (documentIds.length) {
    // Only ever re-link this org's own documents.
    await prisma.document.updateMany({
      where: { id: { in: documentIds }, orgId },
      data: { status: 'pending' },
    });
  }

  await audit('org.submitted', 'Organization', orgId, user.id);
  revalidatePath('/', 'layout');
  return { ok: true };
}

/** Field names the wizard posts for each repeated row. */
const SITE_FIELDS = ['name', 'addressLine', 'city', 'state', 'postalCode', 'country', 'siteType', 'regulatoryId'];
const CREDENTIAL_FIELDS = ['name', 'category', 'number', 'issuingAuthority', 'expiresAt', 'documentId'];

/**
 * Turns the wizard's parallel arrays (`siteName[]`, `siteCity[]`, …) back into
 * row objects. Parallel arrays rather than indexed names (`site.0.city`) so
 * rows can be added and removed client-side without renumbering everything.
 */
function zipRows(formData: FormData, prefix: string, fields: string[]): Record<string, string | undefined>[] {
  const columns = fields.map((f) => formData.getAll(`${prefix}${f[0].toUpperCase()}${f.slice(1)}`).map(String));
  const height = Math.max(0, ...columns.map((c) => c.length));
  return Array.from({ length: height }, (_, i) =>
    Object.fromEntries(fields.map((f, c) => [f, columns[c][i]])),
  );
}

// --------------------------------------------------------------------------
// Products (F2.4)
// --------------------------------------------------------------------------
export async function saveProductAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await currentUser();
  if (!user?.orgId || !can(user.principal, 'product:manage')) return { error: 'unauthorized' };

  const id = String(formData.get('id') ?? '');
  const str = (k: string) => String(formData.get(k) ?? '').trim() || null;

  const leadTime = str('leadTime');
  const purity = str('purity');
  const storage = str('storage');

  // The segment drives the catalogue's whole filter rail, and it decides which
  // spec fields even apply. A form that predates the segment field still posts
  // only `category`, so fall back to deriving from it rather than defaulting
  // silently to `api` — which is how every listing on the platform ended up
  // filed as an API.
  const productType = parseProductType(str('productType')) ?? productTypeFromCategory(str('category'));
  // `stockStatus` is non-nullable with a default, so an unparseable value must
  // leave the column alone rather than write null over an existing answer.
  const stockStatus = parseStockStatus(str('stockStatus'));

  const data = {
    name: String(formData.get('name') ?? '').trim(),
    cas: String(formData.get('cas') ?? '').trim(),
    // Derived, never independently set — see `categoryFromProductType`.
    category: categoryFromProductType(productType),
    grade: str('grade'),
    purity,
    moqKg: Number(formData.get('moqKg') ?? 1) || 1,
    leadTime,
    priceMin: formData.get('priceMin') ? Number(formData.get('priceMin')) : null,
    priceMax: formData.get('priceMax') ? Number(formData.get('priceMax')) : null,
    shelfLife: str('shelfLife'),
    storage,
    // `formula` and `dmfNumber` are registry columns and are written by the
    // spread below — listing them here too would be two sources for one fact.
    sampleAvailable: formData.get('sampleAvailable') === 'on',
    status: String(formData.get('status') ?? 'live'),

    // Filter-backing columns. These are derived rather than asked for again
    // wherever the seller has already said the same thing in prose — a second
    // field holding the same fact is a data-integrity bug (schema.prisma:184).
    productType,
    facet: validFacetFor(productType, str('facet')),
    purityPct: parsePurityPct(purity),
    leadTimeDays: parseLeadTimeDays(leadTime),
    incoterms: joinMulti(parseIncoterms(str('incoterms'))),
    coldChain: parseColdChain(str('coldChain') ?? storage),
    ...(stockStatus ? { stockStatus } : {}),

    // Everything the spec registry declares, split into real columns and the
    // specJson blob by the registry itself. This is what stops the form and
    // the action drifting apart: neither holds its own list of fields.
    ...readSpecFromForm(formData, productType),
  };
  if (!data.name || !data.cas) return { error: 'error' };

  // Live-listing quota. Only counts listings that are actually live, so a plan
  // downgrade never destroys data — it just blocks publishing more.
  if (data.status === 'live') {
    const org = await prisma.organization.findUnique({ where: { id: user.orgId }, select: { plan: true } });
    const live = await prisma.product.count({
      where: { orgId: user.orgId, status: 'live', ...(id ? { id: { not: id } } : {}) },
    });
    if (isAtLimit(org?.plan, 'liveListings', live)) return { error: 'planLimitListings' };
  }

  if (id) {
    const existing = await prisma.product.findUnique({ where: { id }, select: { orgId: true } });
    if (existing?.orgId !== user.orgId) return { error: 'unauthorized' };
    await prisma.product.update({ where: { id }, data });
  } else {
    await prisma.product.create({ data: { ...data, orgId: user.orgId } });
  }
  revalidatePath('/[locale]/seller/products', 'page');
  return { ok: true };
}

export async function toggleProductStatusAction(formData: FormData): Promise<void> {
  const user = await currentUser();
  const id = String(formData.get('id') ?? '');
  if (!user?.orgId || !can(user.principal, 'product:manage')) return;
  const p = await prisma.product.findUnique({ where: { id }, select: { orgId: true, status: true } });
  if (!p || p.orgId !== user.orgId) return;
  await prisma.product.update({ where: { id }, data: { status: p.status === 'live' ? 'unpublished' : 'live' } });
  revalidatePath('/[locale]/seller/products', 'page');
}

// --------------------------------------------------------------------------
// RFQ (F4.1, F4.2)
// --------------------------------------------------------------------------
async function nextRef(prefix: string, count: number): Promise<string> {
  return `${prefix}-${2000 + count + 1}`;
}

/** Runs the rule-based match for a set of criteria against live DB state. */
export async function findMatches(cas: string, requiredCerts: string[], preferredCountry?: string | null) {
  const sellers = await prisma.organization.findMany({
    where: { kind: { in: ['seller', 'both'] }, status: 'verified' },
    select: {
      id: true,
      name: true,
      kind: true,
      status: true,
      country: true,
      city: true,
      products: { select: { cas: true, status: true } },
      certifications: { select: { name: true, status: true, expiresAt: true } },
    },
  });
  const matched = matchSuppliers(sellers as unknown as MatchableSeller[], { cas, requiredCerts, preferredCountry });
  const ids = new Set(matched.map((m) => m.id));
  return sellers.filter((s) => ids.has(s.id));
}

export async function createRfqAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await currentUser();
  if (!user?.orgId) return { error: 'unauthorized' };
  if (!can(user.principal, 'rfq:create')) return { error: 'unverified' };

  // Subscription quota, enforced server-side (a UI-only limit is not a limit).
  const org = await prisma.organization.findUnique({ where: { id: user.orgId }, select: { plan: true } });
  const usedThisMonth = await prisma.rfq.count({
    where: { buyerOrgId: user.orgId, createdAt: { gte: monthStart() } },
  });
  if (isAtLimit(org?.plan, 'rfqsPerMonth', usedThisMonth)) return { error: 'planLimitRfqs' };

  const productName = String(formData.get('productName') ?? '').trim();
  const cas = String(formData.get('cas') ?? '').trim();
  const quantityKg = Number(formData.get('quantityKg') ?? 0);
  const requiredBy = String(formData.get('requiredBy') ?? '');
  if (!productName || !cas || quantityKg <= 0 || !requiredBy) return { error: 'error' };

  const certs = formData.getAll('requiredCerts').map(String).filter(Boolean);
  // The broadcast list is attacker-controlled, so never trust it verbatim.
  // Re-run matching server-side and keep only genuinely matched, verified
  // sellers — and never the buyer's own org (blocks self-dealing / wash trades
  // and spamming arbitrary orgs). (F2.5 invariant.)
  const matchedIds = new Set((await findMatches(cas, certs)).map((m) => m.id));
  const supplierIds = formData
    .getAll('suppliers')
    .map(String)
    .filter(Boolean)
    .filter((id) => matchedIds.has(id) && id !== user.orgId);
  if (supplierIds.length === 0) return { error: 'noMatches' };

  const count = await prisma.rfq.count();
  const rfq = await prisma.rfq.create({
    data: {
      reference: await nextRef('RFQ', count),
      buyerOrgId: user.orgId,
      productName,
      cas,
      quantityKg,
      requiredBy: new Date(requiredBy),
      grade: String(formData.get('grade') ?? '') || null,
      minPurity: String(formData.get('minPurity') ?? '') || null,
      requiredCerts: certs.join(','),
      incoterm: String(formData.get('incoterm') ?? '') || null,
      destination: String(formData.get('destination') ?? '') || null,
      targetPrice: formData.get('targetPrice') ? Number(formData.get('targetPrice')) : null,
      sampleRequested: formData.get('sampleRequested') === 'on',
      notes: String(formData.get('notes') ?? '') || null,
      status: 'open',
      broadcasts: { create: supplierIds.map((orgId) => ({ orgId })) },
    },
  });

  await audit('rfq.posted', 'Rfq', rfq.id, user.id);
  await dispatchEvent('rfq.posted', { rfqId: rfq.id, reference: rfq.reference, cas, quantityKg, requiredCerts: certs }, { orgId: user.orgId });
  for (const orgId of supplierIds) {
    await notifyOrg(orgId, 'rfq.matched', `New RFQ: ${productName}`, {
      body: `${quantityKg} kg · CAS ${cas}`,
      link: `/seller`,
    });
  }
  revalidatePath('/[locale]/buyer/rfqs', 'page');
  return { ok: true, id: rfq.id };
}

// --------------------------------------------------------------------------
// Quotes (F4.3, F4.6)
// --------------------------------------------------------------------------
export async function submitQuoteAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await currentUser();
  if (!user?.orgId) return { error: 'unauthorized' };
  if (!can(user.principal, 'quote:create')) return { error: 'unverified' };

  const rfqId = String(formData.get('rfqId') ?? '');
  const rfq = await prisma.rfq.findUnique({
    where: { id: rfqId },
    select: { id: true, status: true, requiredBy: true, buyerOrgId: true, broadcasts: true },
  });
  if (!rfq) return { error: 'notFound' };
  // Cannot quote an RFQ that is awarded, cancelled, or expired (required-by passed).
  if (!canReceiveQuotes(rfq)) return { error: 'rfqClosed' };
  // No self-dealing: an org may not quote on its own RFQ.
  if (rfq.buyerOrgId === user.orgId) return { error: 'unauthorized' };
  // Only a supplier the RFQ was broadcast to may quote.
  const broadcast = rfq.broadcasts.find((b) => b.orgId === user.orgId);
  if (!broadcast) return { error: 'unauthorized' };
  if (broadcast.declinedAt) return { error: 'alreadyDeclined' };
  if (await prisma.quote.findUnique({ where: { rfqId_sellerOrgId: { rfqId, sellerOrgId: user.orgId } } })) {
    return { error: 'alreadyQuoted' };
  }

  const unitPrice = Number(formData.get('unitPrice') ?? 0);
  if (!unitPrice || unitPrice <= 0) return { error: 'error' };

  const quote = await prisma.quote.create({
    data: {
      rfqId,
      sellerOrgId: user.orgId,
      unitPrice,
      currency: String(formData.get('currency') ?? 'USD'),
      moqKg: Number(formData.get('moqKg') ?? 1) || 1,
      leadTime: String(formData.get('leadTime') ?? '').trim() || '—',
      incoterm: String(formData.get('incoterm') ?? '').trim() || '—',
      paymentTerms: String(formData.get('paymentTerms') ?? '').trim() || '—',
      validUntil: new Date(String(formData.get('validUntil') ?? Date.now() + 12096e5)),
      notes: String(formData.get('notes') ?? '') || null,
    },
  });

  await prisma.rfq.update({ where: { id: rfqId }, data: { status: 'quoted' } });
  await audit('quote.submitted', 'Quote', quote.id, user.id);

  const full = await prisma.rfq.findUnique({ where: { id: rfqId }, select: { buyerOrgId: true, productName: true, reference: true } });
  if (full) {
    await notifyOrg(full.buyerOrgId, 'quote.received', `Quote received on ${full.reference}`, {
      body: `${full.productName} · ${quote.currency} ${quote.unitPrice}/kg`,
      link: `/buyer/rfqs/${rfqId}`,
    });
    await dispatchEvent('quote.received', { rfqId, reference: full.reference, quoteId: quote.id, unitPrice: quote.unitPrice, currency: quote.currency }, { orgId: full.buyerOrgId });
  }
  revalidatePath('/[locale]/seller', 'page');
  return { ok: true, id: quote.id };
}

/** Supplier declines to quote (no-bid). Lets the buyer + ops distinguish
 *  "won't quote" from "hasn't looked yet" (F6.3). */
export async function declineRfqAction(formData: FormData): Promise<void> {
  const user = await currentUser();
  if (!user?.orgId || !can(user.principal, 'quote:create')) return;
  const rfqId = String(formData.get('rfqId') ?? '');
  const reason = String(formData.get('reason') ?? '').trim() || null;

  const link = await prisma.rfqSupplier.findUnique({
    where: { rfqId_orgId: { rfqId, orgId: user.orgId } },
    select: { declinedAt: true },
  });
  if (!link || link.declinedAt) return; // must be on the broadcast list, not already declined

  await prisma.rfqSupplier.update({
    where: { rfqId_orgId: { rfqId, orgId: user.orgId } },
    data: { declinedAt: new Date(), declineReason: reason },
  });
  await audit('rfq.declined', 'Rfq', rfqId, user.id, reason ?? undefined);
  revalidatePath('/[locale]/seller', 'page');
  // Plus a layout-level revalidate — see the note in reviewOrgAction.
  revalidatePath('/', 'layout');
}

export async function acceptQuoteAction(formData: FormData): Promise<void> {
  const user = await currentUser();
  const quoteId = String(formData.get('quoteId') ?? '');
  const locale = safeLocale(formData.get('locale'));
  if (!user?.orgId || !can(user.principal, 'quote:accept')) return;

  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    include: { rfq: true, sellerOrg: { select: { name: true, country: true } } },
  });
  if (!quote || quote.rfq.buyerOrgId !== user.orgId) return; // only the owning buyer
  // No self-dealing: refuse to award a quote from the buyer's own org.
  if (quote.sellerOrgId === quote.rfq.buyerOrgId) return;
  // An RFQ is AWARDED, not "accepted". Cannot award twice, nor award an expired RFQ.
  if (!canBeAwarded(quote.rfq)) {
    redirect(`/${locale}/buyer/rfqs/${quote.rfqId}?error=cannotAward`);
  }
  // THE bug this guards: a quote past its validity must not become a binding
  // deal at a stale price. Mark it expired and bounce back with a message.
  if (!isQuoteValid(quote.validUntil)) {
    await prisma.quote.update({ where: { id: quote.id }, data: { status: 'expired' } });
    redirect(`/${locale}/buyer/rfqs/${quote.rfqId}?error=quoteExpired`);
  }

  const total = quote.unitPrice * quote.rfq.quantityKg;
  const dealCount = await prisma.deal.count();

  await prisma.$transaction([
    prisma.deal.create({
      data: {
        reference: `DEAL-${1000 + dealCount + 1}`,
        rfqId: quote.rfqId,
        quoteId: quote.id,
        totalValue: total,
        currency: quote.currency,
        // Frozen snapshot — the deal record must not drift if the quote changes.
        termsJson: JSON.stringify({
          product: quote.rfq.productName,
          cas: quote.rfq.cas,
          quantityKg: quote.rfq.quantityKg,
          unitPrice: quote.unitPrice,
          currency: quote.currency,
          leadTime: quote.leadTime,
          incoterm: quote.incoterm,
          paymentTerms: quote.paymentTerms,
          supplier: quote.sellerOrg.name,
          acceptedAt: new Date().toISOString(),
        }),
      },
    }),
    prisma.quote.update({ where: { id: quote.id }, data: { status: 'accepted' } }),
    prisma.quote.updateMany({ where: { rfqId: quote.rfqId, id: { not: quote.id } }, data: { status: 'rejected' } }),
    // The RFQ is AWARDED (a supplier won it) — not "accepted" by the buyer.
    prisma.rfq.update({ where: { id: quote.rfqId }, data: { status: 'awarded' } }),
  ]);

  await audit('quote.awarded', 'Quote', quote.id, user.id);
  await notifyOrg(quote.sellerOrgId, 'quote.awarded', `You won the order — ${quote.rfq.reference}`, {
    body: `${quote.rfq.productName} · ${quote.rfq.quantityKg} kg`,
    link: `/seller`,
  });
  await dispatchEvent('quote.awarded', { rfqId: quote.rfqId, reference: quote.rfq.reference, quoteId: quote.id, supplierOrgId: quote.sellerOrgId, total, currency: quote.currency });
  await dispatchEvent('deal.created', { reference: `DEAL-${1000 + dealCount + 1}`, rfqId: quote.rfqId, total, currency: quote.currency });
  redirect(`/${locale}/buyer/rfqs/${quote.rfqId}`);
}

/** Buyer withdraws an RFQ before it is awarded. Notifies broadcast suppliers. */
export async function cancelRfqAction(formData: FormData): Promise<void> {
  const user = await currentUser();
  if (!user?.orgId || !can(user.principal, 'rfq:create')) return;
  const rfqId = String(formData.get('rfqId') ?? '');
  const locale = safeLocale(formData.get('locale'));

  const rfq = await prisma.rfq.findUnique({
    where: { id: rfqId },
    select: { buyerOrgId: true, status: true, requiredBy: true, reference: true, productName: true, broadcasts: { select: { orgId: true } } },
  });
  if (!rfq || rfq.buyerOrgId !== user.orgId) return; // only the owning buyer
  if (!canBeCancelled(rfq)) return; // cannot withdraw an awarded RFQ

  await prisma.$transaction([
    prisma.rfq.update({ where: { id: rfqId }, data: { status: 'cancelled' } }),
    prisma.quote.updateMany({ where: { rfqId, status: 'submitted' }, data: { status: 'rejected' } }),
  ]);
  await audit('rfq.cancelled', 'Rfq', rfqId, user.id);
  for (const b of rfq.broadcasts) {
    await notifyOrg(b.orgId, 'rfq.cancelled', `RFQ withdrawn — ${rfq.reference}`, { body: rfq.productName, link: '/seller' });
  }
  await dispatchEvent('rfq.cancelled', { rfqId, reference: rfq.reference });
  redirect(`/${locale}/buyer/rfqs/${rfqId}`);
}

export async function sendMessageAction(formData: FormData): Promise<void> {
  const user = await currentUser();
  const rfqId = String(formData.get('rfqId') ?? '');
  const body = String(formData.get('body') ?? '').trim();
  if (!user?.orgId || !body) return;
  const rfq = await prisma.rfq.findUnique({ where: { id: rfqId }, select: { buyerOrgId: true, broadcasts: true } });
  if (!rfq) return;
  const party = rfq.buyerOrgId === user.orgId || rfq.broadcasts.some((b) => b.orgId === user.orgId);
  if (!party) return; // only parties to the RFQ may post
  await prisma.message.create({ data: { rfqId, orgId: user.orgId, userId: user.id, body } });
  revalidatePath('/[locale]/buyer/rfqs/[id]', 'page');
}

// --------------------------------------------------------------------------
// Subscription
//
// The platform issues an invoice; settlement happens OFF-PLATFORM (bank
// transfer / external payment link). No card data is captured or stored, so the
// app stays out of PCI scope. No commission is ever taken on trade value.
// --------------------------------------------------------------------------
export async function changePlanAction(formData: FormData): Promise<void> {
  const user = await currentUser();
  const next = parsePlan(String(formData.get('plan') ?? ''));
  if (!user?.orgId) return;
  // Enterprise is quote-based and sales-gated (priceUsd is null → no invoice).
  // Without this, a tenant could POST plan=enterprise and self-grant unlimited
  // quotas + API access + SSO for $0. Only free/growth are self-serviceable.
  if (!SELF_SERVICE_PLANS.has(next)) return;

  const org = await prisma.organization.findUnique({ where: { id: user.orgId }, select: { plan: true, country: true } });
  if (!org || org.plan === next) return;

  const now = new Date();
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());

  await prisma.organization.update({
    where: { id: user.orgId },
    data: { plan: next, planStartedAt: now, planRenewsAt: next === 'free' ? null : periodEnd },
  });

  // Paid plans raise an invoice to be settled off-platform. Enterprise is
  // quote-based, so no amount is invoiced automatically.
  const price = ENTITLEMENTS[next].priceUsd;
  if (price && price > 0) {
    const count = await prisma.invoice.count();
    await prisma.invoice.create({
      data: {
        number: `INV-${now.getFullYear()}-${String(count + 1).padStart(4, '0')}`,
        orgId: user.orgId,
        plan: next,
        periodStart: now,
        periodEnd,
        amount: price,
        currency: 'USD',
        taxRate: org.country === 'India' ? 18 : 0, // GST for Indian orgs
        status: 'issued',
      },
    });
  }

  await audit(`plan.changed.${next}`, 'Organization', user.orgId, user.id);
  // Routes live under /[locale]/… — revalidating '/billing' silently matches
  // nothing. Use the route pattern, not the resolved URL.
  revalidatePath('/[locale]/billing', 'page');
  revalidatePath('/[locale]/pricing', 'page');
}

// --------------------------------------------------------------------------
// User administration (admin only)
//
// Staff accounts are local-only (email + password). They deliberately have NO
// organization: they are PharmaLink employees, not a trading party, so they can
// never post an RFQ or quote regardless of what else changes.
// --------------------------------------------------------------------------
const StaffSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(10),
  role: z.enum(['admin', 'verifier', 'product_admin']),
});

export async function createStaffUserAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await currentUser();
  if (!actor || !can(actor.principal, 'admin:users')) return { error: 'unauthorized' };

  const parsed = StaffSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    if (issue.path[0] === 'password') return { error: 'weakPassword' };
    if (issue.path[0] === 'email') return { error: 'invalidEmail' };
    return { error: 'error' };
  }

  const email = parsed.data.email.trim().toLowerCase();
  if (await prisma.user.findUnique({ where: { email } })) return { error: 'emailTaken' };

  const user = await prisma.user.create({
    data: {
      email,
      name: parsed.data.name,
      passwordHash: await bcrypt.hash(parsed.data.password, 10),
      role: parsed.data.role,
      orgId: null, // staff never belong to a trading organization
      emailVerified: new Date(),
      consentTermsAt: new Date(),
      consentPrivacyAt: new Date(),
    },
  });

  await audit(`staff.created.${parsed.data.role}`, 'User', user.id, actor.id);
  revalidatePath('/[locale]/admin/users', 'page');
  return { ok: true, id: user.id };
}

export async function setStaffRoleAction(formData: FormData): Promise<void> {
  const actor = await currentUser();
  if (!actor || !can(actor.principal, 'admin:users')) return;

  const userId = String(formData.get('userId') ?? '');
  const role = parseRole(String(formData.get('role') ?? ''));
  if (!ASSIGNABLE_STAFF_ROLES.includes(role)) return;

  const target = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!target) return;
  // Only staff roles are editable here — never re-role a buyer/seller account,
  // which would orphan it from its organization.
  if (!isPlatformRole(parseRole(target.role))) return;

  // Guard the last admin: demoting yourself when you are the only one locks
  // everybody out of user administration permanently.
  if (userId === actor.id && role !== 'admin') {
    const admins = await prisma.user.count({ where: { role: 'admin', active: true, deletedAt: null } });
    if (admins <= 1) return;
  }

  await prisma.user.update({ where: { id: userId }, data: { role } });
  await audit(`staff.role.${role}`, 'User', userId, actor.id);
  revalidatePath('/[locale]/admin/users', 'page');
}

export async function setStaffActiveAction(formData: FormData): Promise<void> {
  const actor = await currentUser();
  if (!actor || !can(actor.principal, 'admin:users')) return;

  const userId = String(formData.get('userId') ?? '');
  const active = String(formData.get('active') ?? '') === 'true';

  // You cannot deactivate yourself — an admin locking themselves out mid-session
  // is a support ticket, not a feature.
  if (userId === actor.id) return;

  const target = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, active: true } });
  if (!target) return;

  if (!active && parseRole(target.role) === 'admin') {
    const admins = await prisma.user.count({ where: { role: 'admin', active: true, deletedAt: null } });
    if (admins <= 1) return; // never disable the last admin
  }

  await prisma.user.update({ where: { id: userId }, data: { active } });
  await audit(active ? 'user.reactivated' : 'user.deactivated', 'User', userId, actor.id);
  revalidatePath('/[locale]/admin/users', 'page');
}

// --------------------------------------------------------------------------
// Catalog moderation (admin + product_admin)
// --------------------------------------------------------------------------
export async function moderateProductAction(formData: FormData): Promise<void> {
  const actor = await currentUser();
  if (!actor || !can(actor.principal, 'admin:moderate')) return;

  const id = String(formData.get('id') ?? '');
  const action = String(formData.get('moderation') ?? ''); // "hold" | "publish"
  const reason = String(formData.get('reason') ?? '').trim();
  if (!id || !['hold', 'publish'].includes(action)) return;

  const product = await prisma.product.findUnique({ where: { id }, select: { controlledSchedule: true } });
  if (!product) return;

  // A scheduled substance may never be published from the moderation screen —
  // the jurisdiction-aware policy engine (G13) is Phase 3, so until then the
  // answer is always "no", not "ask an admin nicely".
  if (action === 'publish' && product.controlledSchedule) return;

  await prisma.product.update({
    where: { id },
    data: { status: action === 'hold' ? 'unpublished' : 'live' },
  });
  await audit(action === 'hold' ? 'listing.held' : 'listing.published', 'Product', id, actor.id, reason || undefined);
  if (action === 'publish') await dispatchEvent('product.published', { productId: id });
  revalidatePath('/[locale]/admin/products', 'page');
}

// --------------------------------------------------------------------------
// Admin verification (F6.1)
// --------------------------------------------------------------------------
export async function reviewOrgAction(formData: FormData): Promise<void> {
  const user = await currentUser();
  if (!user || !can(user.principal, 'admin:verify')) return;

  const orgId = String(formData.get('orgId') ?? '');
  const decision = String(formData.get('decision') ?? '');
  const reason = String(formData.get('reason') ?? '').trim();
  if (!orgId || !['approve', 'reject'].includes(decision)) return;
  if (decision === 'reject' && !reason) return; // reason code is mandatory on reject

  if (decision === 'approve') {
    await prisma.$transaction([
      prisma.organization.update({
        where: { id: orgId },
        data: { status: 'verified', verifiedAt: new Date(), reviewedById: user.id, rejectedReason: null },
      }),
      prisma.certification.updateMany({
        where: { orgId, status: 'pending' },
        data: { status: 'verified', verifiedVia: 'Issuing authority (ops check)' },
      }),
      prisma.document.updateMany({
        where: { orgId, status: 'pending' },
        data: { status: 'verified', reviewedById: user.id, reviewedAt: new Date() },
      }),
    ]);
    await audit('org.verified', 'Organization', orgId, user.id);
    await dispatchEvent('org.verified', { orgId }, { orgId });
    await notifyOrg(orgId, 'org.verified', 'Your organization is verified', {
      body: 'You can now transact on PharmaLink.',
      link: '/',
    });
  } else {
    await prisma.$transaction([
      prisma.organization.update({
        where: { id: orgId },
        data: { status: 'rejected', rejectedReason: reason, reviewedById: user.id },
      }),
      prisma.document.updateMany({ where: { orgId, status: 'pending' }, data: { status: 'rejected', reason } }),
    ]);
    await audit('org.rejected', 'Organization', orgId, user.id, reason);
    await notifyOrg(orgId, 'org.rejected', 'Verification was not successful', { body: reason, link: '/' });
  }
  revalidatePath('/[locale]/admin', 'page');
  // The pattern call above cannot refresh the screen on its own. This page is
  // `dynamic = 'force-dynamic'`, so there is no cached entry for the pattern to
  // drop, and Next answers the action with `x-action-revalidated: [[],1,0]` — an
  // EMPTY path list — leaving the browser free to keep the tree it already has.
  // It does, often: an approved applicant goes on sitting in the queue as though
  // the decision had not been taken, and a verifier who thinks the click was
  // lost clicks it again. HARDENING-PLAN.md 1.8.
  //
  // Naming a real path drops the client's router cache. Measured: removing this
  // takes the queue-drains case from intermittent to failing every run, even
  // with the explicit client-side refresh in <ActionSubmit>. The two are
  // complementary, not competing — this drops the cache, that asks for a new
  // tree — so both stay.
  revalidatePath('/', 'layout');
}

// --------------------------------------------------------------------------
// Integrations — API keys & webhooks (partner/other-platform access).
// Trading orgs manage their own; the key is bound to their org so the API only
// ever exposes their own private data (RFQs) plus the public catalogue.
// --------------------------------------------------------------------------
export async function createApiKeyAction(_prev: ActionState, formData: FormData): Promise<ActionState & { rawKey?: string }> {
  const user = await currentUser();
  if (!user?.orgId) return { error: 'unauthorized' };
  const name = String(formData.get('name') ?? '').trim();
  if (name.length < 2) return { error: 'nameTooShort' };

  // Only real scopes may be persisted (mirror the webhook-events allowlist).
  const scopes = formData.getAll('scopes').map(String).filter((s) => (API_SCOPES as readonly string[]).includes(s));
  const { raw, prefix, hashedKey } = generateApiKey();
  const key = await prisma.apiKey.create({
    data: {
      orgId: user.orgId,
      name,
      prefix,
      hashedKey,
      scopes: scopes.length ? scopes.join(' ') : 'catalog:read',
      createdById: user.id,
    },
  });
  await audit('apikey.created', 'ApiKey', key.id, user.id);
  revalidatePath('/[locale]/account/integrations', 'page');
  // The raw key is returned exactly once — it is never retrievable again.
  return { ok: true, id: key.id, rawKey: raw };
}

export async function revokeApiKeyAction(formData: FormData): Promise<void> {
  const user = await currentUser();
  if (!user?.orgId) return;
  const id = String(formData.get('id') ?? '');
  const key = await prisma.apiKey.findUnique({ where: { id }, select: { orgId: true } });
  if (key?.orgId !== user.orgId) return; // only your own keys
  await prisma.apiKey.update({ where: { id }, data: { active: false, revokedAt: new Date() } });
  await audit('apikey.revoked', 'ApiKey', id, user.id);
  revalidatePath('/[locale]/account/integrations', 'page');
}

export async function createWebhookAction(_prev: ActionState, formData: FormData): Promise<ActionState & { secret?: string }> {
  const user = await currentUser();
  if (!user?.orgId) return { error: 'unauthorized' };
  const url = String(formData.get('url') ?? '').trim();
  // https only AND publicly routable — blocks SSRF to internal/metadata hosts.
  if (!(await isSafeWebhookUrl(url))) return { error: 'invalidUrl' };

  const events = formData.getAll('events').map(String).filter((e) => (WEBHOOK_EVENTS as readonly string[]).includes(e));
  const secret = generateWebhookSecret();
  const hook = await prisma.webhook.create({
    data: { orgId: user.orgId, url, secret, events: events.length ? events.join(',') : '*' },
  });
  await audit('webhook.created', 'Webhook', hook.id, user.id);
  revalidatePath('/[locale]/account/integrations', 'page');
  // See reviewOrgAction: without a real path named, the client kept the tree it
  // had — the new endpoint did not appear and the button stayed spinning.
  revalidatePath('/', 'layout');
  return { ok: true, id: hook.id, secret };
}

export async function deleteWebhookAction(formData: FormData): Promise<void> {
  const user = await currentUser();
  if (!user?.orgId) return;
  const id = String(formData.get('id') ?? '');
  const hook = await prisma.webhook.findUnique({ where: { id }, select: { orgId: true } });
  if (hook?.orgId !== user.orgId) return;
  await prisma.webhook.delete({ where: { id } });
  await audit('webhook.deleted', 'Webhook', id, user.id);
  revalidatePath('/[locale]/account/integrations', 'page');
}

// --------------------------------------------------------------------------
// News hub — ops-authored posts for the public homepage (admin + product_admin).
// --------------------------------------------------------------------------
export async function saveNewsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await currentUser();
  if (!user || !can(user.principal, 'admin:moderate')) return { error: 'unauthorized' };

  const title = String(formData.get('title') ?? '').trim();
  const summary = String(formData.get('summary') ?? '').trim();
  if (title.length < 4 || summary.length < 4) return { error: 'error' };

  // The source URL is rendered as an <a href> on the public news page, so reject
  // anything but http(s) — a `javascript:` value would be stored XSS on click.
  const rawSource = String(formData.get('sourceUrl') ?? '').trim();
  if (rawSource && !/^https?:\/\//i.test(rawSource)) return { error: 'invalidUrl' };

  const data = {
    title,
    summary,
    body: String(formData.get('body') ?? '').trim() || null,
    category: String(formData.get('category') ?? 'platform'),
    locale: safeLocale(formData.get('locale')),
    sourceUrl: rawSource || null,
  };

  const publish = formData.get('publish') === 'on';
  const post = await prisma.newsPost.create({
    data: { ...data, authorId: user.id, status: publish ? 'published' : 'draft', publishedAt: publish ? new Date() : null },
  });
  await audit(publish ? 'news.published' : 'news.drafted', 'NewsPost', post.id, user.id);
  revalidatePath('/[locale]/admin/news', 'page');
  revalidatePath('/[locale]', 'page');
  return { ok: true, id: post.id };
}

export async function toggleNewsAction(formData: FormData): Promise<void> {
  const user = await currentUser();
  if (!user || !can(user.principal, 'admin:moderate')) return;
  const id = String(formData.get('id') ?? '');
  const post = await prisma.newsPost.findUnique({ where: { id }, select: { status: true } });
  if (!post) return;
  const publish = post.status !== 'published';
  await prisma.newsPost.update({ where: { id }, data: { status: publish ? 'published' : 'draft', publishedAt: publish ? new Date() : null } });
  await audit(publish ? 'news.published' : 'news.unpublished', 'NewsPost', id, user.id);
  revalidatePath('/[locale]/admin/news', 'page');
  revalidatePath('/[locale]', 'page');
}

export async function deleteNewsAction(formData: FormData): Promise<void> {
  const user = await currentUser();
  if (!user || !can(user.principal, 'admin:moderate')) return;
  const id = String(formData.get('id') ?? '');
  await prisma.newsPost.delete({ where: { id } }).catch(() => undefined);
  await audit('news.deleted', 'NewsPost', id, user.id);
  revalidatePath('/[locale]/admin/news', 'page');
}
