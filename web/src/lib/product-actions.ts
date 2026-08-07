'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { currentUser } from '@/lib/session';
import { can } from '@/lib/rbac';
import { parseProductsCsv } from '@/lib/csv';
import { normalizeTiers } from '@/lib/tiers';

export type ProductActionState = { error?: string; ok?: boolean; imported?: number; skipped?: number };

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
  if (rows.length === 0) return { error: errors[0] === 'emptyFile' ? 'emptyFile' : 'noValidRows' };

  let imported = 0;
  for (const r of rows) {
    const existing = await prisma.product.findFirst({ where: { orgId: user.orgId, cas: r.cas, name: r.name }, select: { id: true } });
    const data = {
      name: r.name,
      cas: r.cas,
      category: r.category,
      grade: r.grade,
      purity: r.purity,
      moqKg: r.moqKg,
      leadTime: r.leadTime,
      priceMin: r.priceMin,
      priceMax: r.priceMax,
    };
    if (existing) {
      await prisma.product.update({ where: { id: existing.id }, data });
    } else {
      await prisma.product.create({ data: { ...data, orgId: user.orgId, status: 'draft' } });
    }
    imported += 1;
  }
  await audit('products.imported', user.orgId, user.id);
  revalidatePath('/[locale]/seller/products', 'page');
  return { ok: true, imported, skipped: errors.length };
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
