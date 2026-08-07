import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { currentUser } from '@/lib/session';
import { store, sha256, storageKeyFor, safeFilename, validateUpload } from '@/lib/storage';

/**
 * Document upload (BACKLOG F2.3).
 *
 * A plain route rather than a server action: the uploader lives inside the
 * onboarding <form>, and a nested <form> is invalid HTML. A route keeps the
 * client a simple fetch() and is independently testable with curl.
 *
 * Bytes are validated, SHA-256 hashed and written under an opaque key. The file
 * is never given a public URL — reads go through GET /api/documents/[id].
 */
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user?.orgId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'uploadEmpty' }, { status: 400 });

  const check = validateUpload({ size: file.size, type: file.type });
  if (!check.ok) {
    const error =
      check.reason === 'too-large' ? 'uploadTooLarge' : check.reason === 'empty' ? 'uploadEmpty' : 'uploadBadType';
    return NextResponse.json({ error }, { status: 400 });
  }

  // A document may be linked to an RFQ or quote, but only by a party to it —
  // otherwise an attacker could staple their own file onto an unrelated deal
  // (making it downloadable by, or appear as evidence to, that deal's parties).
  const rfqId = (form.get('rfqId') as string) || null;
  const quoteId = (form.get('quoteId') as string) || null;
  if (rfqId) {
    const rfq = await prisma.rfq.findUnique({
      where: { id: rfqId },
      select: { buyerOrgId: true, broadcasts: { select: { orgId: true } } },
    });
    const party = rfq && (rfq.buyerOrgId === user.orgId || rfq.broadcasts.some((b) => b.orgId === user.orgId));
    if (!party) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  if (quoteId) {
    const quote = await prisma.quote.findUnique({
      where: { id: quoteId },
      select: { sellerOrgId: true, rfq: { select: { buyerOrgId: true } } },
    });
    const party = quote && (quote.sellerOrgId === user.orgId || quote.rfq.buyerOrgId === user.orgId);
    if (!party) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const digest = sha256(bytes);

  // Identical bytes already on file for this org? Reuse instead of duplicating.
  const existing = await prisma.document.findFirst({
    where: { orgId: user.orgId, sha256: digest },
    select: { id: true, filename: true, sha256: true },
  });
  if (existing) return NextResponse.json(existing);

  const key = storageKeyFor(user.orgId, check.ext);
  await store.put(key, bytes);

  const doc = await prisma.document.create({
    data: {
      orgId: user.orgId,
      kind: String(form.get('kind') ?? 'gmp_cert'),
      filename: safeFilename(file.name),
      mimeType: file.type,
      sizeBytes: file.size,
      storageKey: key,
      sha256: digest,
      status: 'pending',
      rfqId,
      quoteId,
    },
    select: { id: true, filename: true, sha256: true },
  });

  await prisma.auditLog.create({
    data: { action: 'document.uploaded', entity: 'Document', entityId: doc.id, actorId: user.id },
  });

  return NextResponse.json(doc, { status: 201 });
}
