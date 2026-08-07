import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { store } from '@/lib/storage';
import { currentUser } from '@/lib/session';
import { isAdmin } from '@/lib/rbac';

/**
 * Brokered document download (BACKLOG F7.2, ARCHITECTURE.md §7/§8.3 item 5).
 *
 * Files have no public URL. Every read is authorized here and audited, so we
 * always know who opened which certificate and when.
 *
 * Access is granted to:
 *   - the owning organization
 *   - platform admins (ops verification)
 *   - a VERIFIED counterparty that is party to the RFQ the document is attached to
 * Everyone else gets 404 — not 403, so the existence of a document is not
 * disclosed to strangers.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) return new NextResponse(null, { status: 404 });

  const doc = await prisma.document.findUnique({
    where: { id },
    include: {
      rfq: { select: { buyerOrgId: true, broadcasts: { select: { orgId: true } } } },
      quote: { select: { sellerOrgId: true, rfq: { select: { buyerOrgId: true } } } },
    },
  });
  if (!doc?.storageKey) return new NextResponse(null, { status: 404 });

  const owns = doc.orgId === user.orgId;
  const admin = isAdmin(user.principal);

  // Counterparty access requires BOTH being party to the RFQ *and* being
  // verified — an unverified org never reads another company's certificates.
  let counterparty = false;
  if (user.orgId && user.principal.orgStatus === 'verified') {
    if (doc.rfq) {
      counterparty =
        doc.rfq.buyerOrgId === user.orgId || doc.rfq.broadcasts.some((b) => b.orgId === user.orgId);
    } else if (doc.quote) {
      counterparty = doc.quote.sellerOrgId === user.orgId || doc.quote.rfq.buyerOrgId === user.orgId;
    }
  }

  if (!owns && !admin && !counterparty) return new NextResponse(null, { status: 404 });

  let body: Buffer;
  try {
    body = await store.get(doc.storageKey);
  } catch {
    return new NextResponse(null, { status: 404 });
  }

  // Every read is logged — this is the evidence trail for document access.
  await prisma.auditLog.create({
    data: {
      action: 'document.accessed',
      entity: 'Document',
      entityId: doc.id,
      actorId: user.id,
      meta: JSON.stringify({ via: owns ? 'owner' : admin ? 'admin' : 'counterparty' }),
    },
  });

  return new NextResponse(new Uint8Array(body), {
    status: 200,
    headers: {
      'Content-Type': doc.mimeType ?? 'application/octet-stream',
      // `attachment` + a sanitised name: never render untrusted files inline.
      'Content-Disposition': `attachment; filename="${doc.filename.replace(/"/g, '')}"`,
      'Content-Length': String(body.byteLength),
      // Private, per-user content must never be cached by a shared proxy.
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
