'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { currentUser } from '@/lib/session';
import { can } from '@/lib/rbac';
import { parseTemplateDate } from '@/lib/dates';
import { parseNumber, parseInteger, parsePercent } from '@/lib/numbers';
import { parseFilingStatus, parseTriBool } from '@/lib/vocab';

/**
 * Seller-managed facilities and regulatory filings.
 *
 * Sites were previously creatable only inside the onboarding wizard, so a
 * supplier who commissioned a plant in year two had nowhere to record it.
 * Filings had no home at all.
 *
 * The division of labour mirrors certifications: **the supplier declares, ops
 * verifies.** Nothing here writes an ops-controlled field — not
 * `Organization.status`, not `Certification.status`, and never
 * `RegulatoryAction`, which is sourced from openFDA and EudraGMDP precisely
 * because a supplier cannot be trusted to disclose their own import alert.
 */

export type DetailActionState = { error?: string; ok?: boolean };

async function ownOrg() {
  const user = await currentUser();
  if (!user?.orgId || !can(user.principal, 'product:manage')) return null;
  return { userId: user.id, orgId: user.orgId };
}

async function audit(action: string, entity: string, entityId: string, actorId: string) {
  await prisma.auditLog.create({ data: { action, entity, entityId, actorId } });
}

const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim() || null;

export async function saveFacilityAction(_prev: DetailActionState, formData: FormData): Promise<DetailActionState> {
  const me = await ownOrg();
  if (!me) return { error: 'unauthorized' };

  const id = String(formData.get('id') ?? '');
  const name = str(formData, 'name');
  if (!name) return { error: 'error' };

  const data = {
    name,
    // `location` is the legacy human summary; keep it consistent rather than
    // letting it drift from the structured fields beside it.
    location: [str(formData, 'city'), str(formData, 'state'), str(formData, 'country')].filter(Boolean).join(', '),
    addressLine: str(formData, 'addressLine'),
    city: str(formData, 'city'),
    state: str(formData, 'state'),
    postalCode: str(formData, 'postalCode'),
    country: str(formData, 'country'),
    siteType: String(formData.get('siteType') ?? 'manufacturing'),
    regulatoryId: str(formData, 'regulatoryId'),
    emaSiteRef: str(formData, 'emaSiteRef'),
    fdaGmpStatus: str(formData, 'fdaGmpStatus'),
    euGmpStatus: str(formData, 'euGmpStatus'),
    whoGmpStatus: str(formData, 'whoGmpStatus'),
    lastFdaInspectionAt: parseTemplateDate(str(formData, 'lastFdaInspectionAt')).value,
    fdaInspectionOutcome: str(formData, 'fdaInspectionOutcome'),
    lastEuInspectionAt: parseTemplateDate(str(formData, 'lastEuInspectionAt')).value,
    euInspectionOutcome: str(formData, 'euInspectionOutcome'),
    form483Count: parseInteger(str(formData, 'form483Count')).value,
    capacityValue: parseNumber(str(formData, 'capacityValue')).value,
    // A capacity without its unit is not a capacity — sheet 8's own heading is
    // "Annual Capacity (MT or Units)".
    capacityUnit: str(formData, 'capacityUnit'),
    utilizationPct: parsePercent(str(formData, 'utilizationPct')).value,
    manufacturingType: str(formData, 'manufacturingType'),
    containmentLevel: str(formData, 'containmentLevel'),
    sterile: parseTriBool(str(formData, 'sterile')),
    coldChainCapability: str(formData, 'coldChainCapability'),
    productionLines: parseInteger(str(formData, 'productionLines')).value,
    qcLabs: parseInteger(str(formData, 'qcLabs')).value,
    yearEstablished: parseInteger(str(formData, 'yearEstablished')).value,
    employees: parseInteger(str(formData, 'employees')).value,
  };

  if (id) {
    // Ownership before existence: a probe must not learn which ids exist.
    const existing = await prisma.site.findUnique({ where: { id }, select: { orgId: true } });
    if (existing?.orgId !== me.orgId) return { error: 'unauthorized' };
    await prisma.site.update({ where: { id }, data });
    await audit('site.updated', 'Site', id, me.userId);
  } else {
    const created = await prisma.site.create({ data: { ...data, orgId: me.orgId } });
    await audit('site.created', 'Site', created.id, me.userId);
  }
  revalidatePath('/[locale]/seller/facilities', 'page');
  revalidatePath('/', 'layout');
  return { ok: true };
}

export async function deleteFacilityAction(formData: FormData): Promise<void> {
  const me = await ownOrg();
  const id = String(formData.get('id') ?? '');
  if (!me || !id) return;
  const site = await prisma.site.findUnique({ where: { id }, select: { orgId: true, certifications: { select: { id: true } } } });
  if (site?.orgId !== me.orgId) return;
  // A certificate names one specific site. Deleting the site out from under it
  // would leave a GMP claim pointing nowhere, which is worse than a stale site.
  if (site.certifications.length > 0) return;
  await prisma.site.delete({ where: { id } });
  await audit('site.deleted', 'Site', id, me.userId);
  revalidatePath('/[locale]/seller/facilities', 'page');
  revalidatePath('/', 'layout');
}

export async function saveFilingAction(_prev: DetailActionState, formData: FormData): Promise<DetailActionState> {
  const me = await ownOrg();
  if (!me) return { error: 'unauthorized' };

  const id = String(formData.get('id') ?? '');
  const filingType = str(formData, 'filingType');
  const filingNumber = str(formData, 'filingNumber');
  if (!filingType || !filingNumber) return { error: 'error' };

  const data = {
    filingType,
    filingNumber,
    authority: str(formData, 'authority'),
    country: str(formData, 'country'),
    status: parseFilingStatus(str(formData, 'status')) ?? 'active',
    cas: str(formData, 'cas'),
    productName: str(formData, 'productName'),
    filedAt: parseTemplateDate(str(formData, 'filedAt')).value,
    approvedAt: parseTemplateDate(str(formData, 'approvedAt')).value,
    // Null is a real answer: a DMF has no expiry, and the register reports that
    // as unknown rather than pretending it is fine.
    expiresAt: parseTemplateDate(str(formData, 'expiresAt')).value,
    renewalDueAt: parseTemplateDate(str(formData, 'renewalDueAt')).value,
    holderName: str(formData, 'holderName'),
    scope: str(formData, 'scope'),
    openToReference: parseTriBool(str(formData, 'openToReference')),
    referencingCount: parseInteger(str(formData, 'referencingCount')).value,
    sitesCovered: str(formData, 'sitesCovered'),
    sourceUrl: str(formData, 'sourceUrl'),
  };

  if (id) {
    const existing = await prisma.regulatoryFiling.findUnique({ where: { id }, select: { orgId: true } });
    if (existing?.orgId !== me.orgId) return { error: 'unauthorized' };
    await prisma.regulatoryFiling.update({ where: { id }, data });
    await audit('filing.updated', 'RegulatoryFiling', id, me.userId);
  } else {
    // The natural key is (org, type, number) — re-declaring the same filing is
    // an edit, not a duplicate.
    const clash = await prisma.regulatoryFiling.findFirst({
      where: { orgId: me.orgId, filingType, filingNumber },
      select: { id: true },
    });
    if (clash) {
      await prisma.regulatoryFiling.update({ where: { id: clash.id }, data });
      await audit('filing.updated', 'RegulatoryFiling', clash.id, me.userId);
    } else {
      const created = await prisma.regulatoryFiling.create({ data: { ...data, orgId: me.orgId } });
      await audit('filing.created', 'RegulatoryFiling', created.id, me.userId);
    }
  }
  revalidatePath('/[locale]/seller/filings', 'page');
  revalidatePath('/', 'layout');
  return { ok: true };
}

export async function deleteFilingAction(formData: FormData): Promise<void> {
  const me = await ownOrg();
  const id = String(formData.get('id') ?? '');
  if (!me || !id) return;
  const filing = await prisma.regulatoryFiling.findUnique({ where: { id }, select: { orgId: true } });
  if (filing?.orgId !== me.orgId) return;
  await prisma.regulatoryFiling.delete({ where: { id } });
  await audit('filing.deleted', 'RegulatoryFiling', id, me.userId);
  revalidatePath('/[locale]/seller/filings', 'page');
  revalidatePath('/', 'layout');
}
