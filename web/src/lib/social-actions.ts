'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { currentUser } from '@/lib/session';
import { can } from '@/lib/rbac';
import { cleanText, cleanBody } from '@/lib/sanitize';
import { clampRating, parseReviewTags, canReviewSupplier } from '@/lib/reviews';
import { hasDealWith } from '@/lib/social-queries';

export type SocialActionState = { error?: string; ok?: boolean; saved?: boolean };

async function audit(action: string, entity: string, entityId: string, actorId?: string) {
  await prisma.auditLog.create({ data: { action, entity, entityId, actorId: actorId ?? null } });
}

/**
 * Toggle a supplier on/off the current buyer org's shortlist. Verified buyers
 * only; a supplier can't shortlist itself.
 */
export async function saveSupplierAction(formData: FormData): Promise<void> {
  const user = await currentUser();
  if (!user?.orgId || !can(user.principal, 'rfq:create')) return; // buyer/both capability
  const supplierOrgId = String(formData.get('supplierOrgId') ?? '');
  if (!supplierOrgId || supplierOrgId === user.orgId) return;

  const existing = await prisma.savedSupplier.findUnique({
    where: { orgId_supplierOrgId: { orgId: user.orgId, supplierOrgId } },
  });
  if (existing) {
    await prisma.savedSupplier.delete({ where: { id: existing.id } });
  } else {
    // Only shortlist a real verified supplier.
    const supplier = await prisma.organization.findFirst({
      where: { id: supplierOrgId, status: 'verified', kind: { in: ['seller', 'both'] } },
      select: { id: true },
    });
    if (!supplier) return;
    await prisma.savedSupplier.create({ data: { orgId: user.orgId, supplierOrgId } });
  }
  revalidatePath('/[locale]/suppliers/[id]', 'page');
  revalidatePath('/[locale]/buyer/saved', 'page');
  revalidatePath('/[locale]/buyer', 'page');
}

/**
 * Create or update the current buyer org's review of a supplier. One review per
 * buyer-org per supplier; `verifiedBuyer` is set from a real completed deal.
 */
export async function submitReviewAction(_prev: SocialActionState, formData: FormData): Promise<SocialActionState> {
  const user = await currentUser();
  if (!user?.orgId) return { error: 'unauthorized' };

  const supplierOrgId = String(formData.get('supplierOrgId') ?? '');
  const org = await prisma.organization.findUnique({ where: { id: user.orgId }, select: { kind: true, status: true } });
  if (org?.status !== 'verified') return { error: 'notVerified' };
  if (!canReviewSupplier({ authorOrgId: user.orgId, authorKind: org.kind, supplierOrgId })) return { error: 'cannotReview' };

  const rating = clampRating(formData.get('rating'));
  if (rating < 1) return { error: 'ratingRequired' };

  const title = cleanText(String(formData.get('title') ?? ''), 120) || null;
  const body = cleanBody(String(formData.get('body') ?? ''), 2000) || null;
  const tags = parseReviewTags(formData.getAll('tags').map(String).join(',')).join(',') || null;
  const verifiedBuyer = await hasDealWith(user.orgId, supplierOrgId);

  await prisma.review.upsert({
    where: { supplierOrgId_authorOrgId: { supplierOrgId, authorOrgId: user.orgId } },
    create: { supplierOrgId, authorOrgId: user.orgId, authorUserId: user.id, rating, title, body, tags, verifiedBuyer },
    update: { rating, title, body, tags, verifiedBuyer },
  });
  await audit('review.submitted', 'Review', supplierOrgId, user.id);
  revalidatePath('/[locale]/suppliers/[id]', 'page');
  return { ok: true };
}

/** Ops moderation: hide/show a review. */
export async function moderateReviewAction(formData: FormData): Promise<void> {
  const user = await currentUser();
  if (!user || !can(user.principal, 'admin:moderate')) return;
  const id = String(formData.get('id') ?? '');
  const review = await prisma.review.findUnique({ where: { id }, select: { status: true } });
  if (!review) return;
  await prisma.review.update({ where: { id }, data: { status: review.status === 'published' ? 'hidden' : 'published' } });
  await audit('review.moderated', 'Review', id, user.id);
  revalidatePath('/[locale]/suppliers/[id]', 'page');
}
