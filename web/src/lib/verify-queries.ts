import { prisma } from '@/lib/db';
import { normalizeSha256 } from '@/lib/hash';

export type VerifyResult =
  | { status: 'invalid' }
  | { status: 'notfound'; hash: string }
  | {
      status: 'found';
      hash: string;
      kind: string;
      filename: string;
      orgName: string;
      certName: string | null;
      docStatus: string;
      registeredAt: Date;
    };

/**
 * Verifies a pasted SHA-256 against the registered document hashes. Returns what
 * the hash authenticates (kind, owner, cert, date) WITHOUT exposing the file —
 * real tamper-evidence, no blockchain theatre.
 */
export async function verifyDocumentHash(raw: string): Promise<VerifyResult> {
  const hash = normalizeSha256(raw);
  if (!hash) return { status: 'invalid' };

  const doc = await prisma.document.findFirst({
    where: { sha256: hash },
    select: {
      kind: true,
      filename: true,
      status: true,
      createdAt: true,
      org: { select: { name: true } },
      certification: { select: { name: true } },
    },
  });
  if (!doc) return { status: 'notfound', hash };
  return {
    status: 'found',
    hash,
    kind: doc.kind,
    filename: doc.filename,
    orgName: doc.org.name,
    certName: doc.certification?.name ?? null,
    docStatus: doc.status,
    registeredAt: doc.createdAt,
  };
}

/** An org's documents that carry a registered hash (the document registry). */
export async function getOrgDocuments(orgId: string) {
  return prisma.document.findMany({
    where: { orgId, sha256: { not: null } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, kind: true, filename: true, sha256: true, status: true, createdAt: true, certification: { select: { name: true } } },
  });
}
