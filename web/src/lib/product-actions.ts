'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { currentUser } from '@/lib/session';
import { can } from '@/lib/rbac';
import { parseProductsCsv } from '@/lib/csv';
import { normalizeTiers } from '@/lib/tiers';

export type ProductActionState = {
  error?: string;
  ok?: boolean;
  imported?: number;
  skipped?: number;
  /**
   * Per-row rejection messages, e.g. `row 2: CAS check digit failed (999-00-0)`.
   *
   * `csv.ts` has always collected these rather than dropping rows silently, but
   * nothing rendered them — so a seller whose paste was rejected saw only
   * "no valid rows" with no way to tell which row or why. Capped, because a
   * pasted file with 400 bad rows should not return 400 messages.
   */
  rowErrors?: string[];
};

/** How many per-row messages to surface. Enough to fix a paste, not a wall of text. */
const MAX_ROW_ERRORS = 10;

async function audit(action: string, entityId: string, actorId?: string) {
  await prisma.auditLog.create({ data: { action, entity: 'Product', entityId, actorId: actorId ?? null } });
}

/**
 * Bulk-imports products from pasted CSV. New listings are created as DRAFT (the
 * seller publishes them after review — this also keeps the live-listing quota
 * out of a bulk paste). Existing products (same name+CAS) are updated in place.
 */
export async function importProductsAction(_prev: ProductActionState, formData: FormData): Promise<ProductActionState> {
  const user = await currentUser();
  if (!user?.orgId || !can(user.principal, 'product:manage')) return { error: 'unauthorized' };

  const text = String(formData.get('csv') ?? '');
  const { rows, errors } = parseProductsCsv(text);
  if (rows.length === 0) {
    const emptyFile = errors[0] === 'emptyFile';
    return { error: emptyFile ? 'emptyFile' : 'noValidRows', rowErrors: emptyFile ? [] : errors.slice(0, MAX_ROW_ERRORS) };
  }

  let imported = 0;
  for (const r of rows) {
    const existing = await prisma.product.findFirst({ where: { orgId: user.orgId, cas: r.cas, name: r.name }, select: { id: true } });
    // `stockStatus` is non-nullable with a default, so an absent column must
    // leave it alone rather than overwrite an existing answer with null.
    const { stockStatus, ...rest } = r;
    const data = { ...rest, ...(stockStatus ? { stockStatus } : {}) };
    if (existing) {
      await prisma.product.update({ where: { id: existing.id }, data });
    } else {
      await prisma.product.create({ data: { ...data, orgId: user.orgId, status: 'draft' } });
    }
    imported += 1;
  }
  await audit('products.imported', user.orgId, user.id);
  revalidatePath('/[locale]/seller/products', 'page');
  return { ok: true, imported, skipped: errors.length, rowErrors: errors.slice(0, MAX_ROW_ERRORS) };
}

/** Replaces the volume price tiers for one of the seller's products. */
export async function savePriceTiersAction(formData: FormData): Promise<void> {
  const user = await currentUser();
  if (!user?.orgId || !can(user.principal, 'product:manage')) return;
  const productId = String(formData.get('productId') ?? '');
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { orgId: true } });
  if (product?.orgId !== user.orgId) return;

  const minQtys = formData.getAll('minQtyKg').map((v) => Number(v));
  const prices = formData.getAll('pricePerKg').map((v) => Number(v));
  const tiers = normalizeTiers(minQtys.map((minQtyKg, i) => ({ minQtyKg, pricePerKg: prices[i] })));

  await prisma.$transaction([
    prisma.productPriceTier.deleteMany({ where: { productId } }),
    ...(tiers.length ? [prisma.productPriceTier.createMany({ data: tiers.map((t) => ({ productId, ...t })) })] : []),
  ]);
  await audit('product.tiers', productId, user.id);
  revalidatePath('/[locale]/seller/products', 'page');
  revalidatePath('/[locale]/products/[id]', 'page');
}
