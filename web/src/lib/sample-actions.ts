'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { currentUser } from '@/lib/session';
import { can } from '@/lib/rbac';
import { cleanText } from '@/lib/sanitize';
import { canSellerSetSample } from '@/lib/samples';

export type SampleState = { error?: string; ok?: boolean };

async function audit(action: string, entityId: string, actorId?: string) {
  await prisma.auditLog.create({ data: { action, entity: 'SampleRequest', entityId, actorId: actorId ?? null } });
}

function revalidateSamples() {
  revalidatePath('/[locale]/products/[id]', 'page');
  revalidatePath('/[locale]/seller', 'page');
  revalidatePath('/[locale]/buyer', 'page');
}

/** Buyer requests a sample of a live, sample-available product. */
export async function requestSampleAction(_prev: SampleState, formData: FormData): Promise<SampleState> {
  const user = await currentUser();
  if (!user?.orgId || !can(user.principal, 'rfq:create')) return { error: 'unauthorized' };

  const productId = String(formData.get('productId') ?? '');
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, orgId: true, status: true, sampleAvailable: true },
  });
  if (!product || product.status !== 'live' || !product.sampleAvailable) return { error: 'notAvailable' };
  if (product.orgId === user.orgId) return { error: 'ownProduct' };

  const data = {
    quantityG: Number(formData.get('quantityG') ?? 0) || null,
    shipTo: cleanText(String(formData.get('shipTo') ?? ''), 200) || null,
    note: cleanText(String(formData.get('note') ?? ''), 300) || null,
  };
  try {
    await prisma.sampleRequest.upsert({
      where: { productId_buyerOrgId: { productId, buyerOrgId: user.orgId } },
      create: { productId, buyerOrgId: user.orgId, sellerOrgId: product.orgId, requestUserId: user.id, status: 'requested', ...data },
      update: { status: 'requested', declineReason: null, ...data },
    });
  } catch {
    return { error: 'requestFailed' };
  }
  await audit('sample.requested', productId, user.id);
  revalidateSamples();
  return { ok: true };
}

/** Seller approves / ships / declines a sample request. */
export async function updateSampleAction(formData: FormData): Promise<void> {
  const user = await currentUser();
  if (!user?.orgId) return;
  const id = String(formData.get('id') ?? '');
  const next = String(formData.get('status') ?? '');
  const sample = await prisma.sampleRequest.findUnique({ where: { id }, select: { sellerOrgId: true, status: true } });
  if (!sample || sample.sellerOrgId !== user.orgId) return; // seller only
  if (!canSellerSetSample(sample.status, next)) return;

  await prisma.sampleRequest.update({
    where: { id },
    data: {
      status: next,
      trackingRef: next === 'shipped' ? cleanText(String(formData.get('trackingRef') ?? ''), 80) || null : undefined,
      declineReason: next === 'declined' ? cleanText(String(formData.get('declineReason') ?? ''), 200) || null : undefined,
    },
  });
  await audit(`sample.${next}`, id, user.id);
  revalidateSamples();
}
