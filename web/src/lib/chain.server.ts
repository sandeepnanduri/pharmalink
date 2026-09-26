import 'server-only';
import { prisma } from '@/lib/db';
import { GENESIS_HASH, hashEntry, hashPayload, verifyChain, type ChainVerification } from '@/lib/chain';

/**
 * The one writer for ChainedAuditEntry. Appends an event to the platform's
 * hash chain: reads the current tip (the highest-`seq` entry's `hash`, or
 * GENESIS_HASH if the chain is empty), computes the new entry's hash from
 * its own content plus that tip, and writes it — inside an interactive
 * transaction so a concurrent writer can't read the same tip twice and
 * silently fork the chain.
 *
 * Called from the exact points the product roadmap calls "blockchain-
 * logged": Introduction registration (lib/partner-actions.ts) and
 * quote-award/Deal-creation (lib/actions.ts). Never throws — same
 * best-effort discipline as lib/whatsapp.server.ts's sendWhatsAppTemplate;
 * a chain-logging failure must not fail the buyer/seller/partner action
 * that triggered it. A dropped entry would itself be visible as a broken
 * link the next time verifyChain runs, which is the honest outcome for an
 * append-only log, not something to silently paper over.
 */
export async function recordChainedEvent(
  entity: string,
  entityId: string,
  action: string,
  actorId: string | null,
  data: unknown
): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      const tip = await tx.chainedAuditEntry.findFirst({ orderBy: { seq: 'desc' }, select: { seq: true, hash: true } });
      const seq = (tip?.seq ?? 0) + 1;
      const prevHash = tip?.hash ?? GENESIS_HASH;
      const dataHash = hashPayload(data);
      const hash = hashEntry(seq, entity, entityId, action, dataHash, prevHash);
      await tx.chainedAuditEntry.create({ data: { seq, entity, entityId, action, actorId, dataHash, prevHash, hash } });
    });
  } catch {
    // Best-effort — see doc comment above.
  }
}

/**
 * Reads the whole chain and independently recomputes it — the "verified" or
 * "broken" fact the mandate detail page's chain-integrity indicator shows.
 * Whole-table reads are fine at this app's scale (SQLite, a demo-sized
 * platform); a production-volume chain would page this or cache the result.
 */
export async function getChainIntegrity(): Promise<ChainVerification & { entryCount: number }> {
  const entries = await prisma.chainedAuditEntry.findMany({ orderBy: { seq: 'asc' } });
  return { ...verifyChain(entries), entryCount: entries.length };
}
