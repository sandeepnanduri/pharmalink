import { createHash } from 'node:crypto';

/**
 * Hash-chained tamper-evidence — pure + unit tested, no Prisma import (same
 * convention lib/partner.ts's pure-logic half already follows). NOT a
 * blockchain: one database, no distributed consensus, no proof-of-work. What
 * it IS: a real Merkle-style hash chain — each entry commits to its own
 * payload and to the previous entry's hash, so editing or deleting any past
 * row breaks every hash computed after it. Anyone holding a copy of the
 * chain can independently recompute and verify it, the same tamper-evidence
 * property lib/hash.ts already documents for a single document's bytes,
 * extended across a sequence of platform events.
 */

export const GENESIS_HASH = '0'.repeat(64);

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/** The content hash of an event's own payload — hashed independently of the
 *  chain linkage so the same event always produces the same dataHash. */
export function hashPayload(data: unknown): string {
  return sha256Hex(JSON.stringify(data ?? null));
}

/** The linking hash for one chain entry: commits to its position (`seq`),
 *  its own content (`dataHash`), and the entire chain before it (`prevHash`). */
export function hashEntry(
  seq: number,
  entity: string,
  entityId: string,
  action: string,
  dataHash: string,
  prevHash: string
): string {
  return sha256Hex(`${seq}|${entity}|${entityId}|${action}|${dataHash}|${prevHash}`);
}

export interface ChainEntryInput {
  seq: number;
  entity: string;
  entityId: string;
  action: string;
  dataHash: string;
  prevHash: string;
  hash: string;
}

export interface ChainVerification {
  valid: boolean;
  /** The first `seq` whose stored hash doesn't match the recomputed one, or
   *  whose `prevHash` doesn't match the prior entry's `hash` — null if valid. */
  brokenAtSeq: number | null;
}

/**
 * Recomputes every entry's hash from its own fields and checks it against
 * the stored value, and checks each entry's `prevHash` links to the prior
 * entry's `hash` (or GENESIS_HASH for the first entry). `entries` must
 * already be sorted by `seq` ascending — this function does not sort, so a
 * caller passing an unsorted or filtered subset gets a meaningless result.
 */
export function verifyChain(entries: ChainEntryInput[]): ChainVerification {
  let expectedPrevHash = GENESIS_HASH;
  for (const e of entries) {
    if (e.prevHash !== expectedPrevHash) return { valid: false, brokenAtSeq: e.seq };
    const recomputed = hashEntry(e.seq, e.entity, e.entityId, e.action, e.dataHash, e.prevHash);
    if (recomputed !== e.hash) return { valid: false, brokenAtSeq: e.seq };
    expectedPrevHash = e.hash;
  }
  return { valid: true, brokenAtSeq: null };
}
