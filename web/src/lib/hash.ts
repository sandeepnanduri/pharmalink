/**
 * Document-integrity helpers — pure + unit tested. Real SHA-256 tamper-evidence
 * (NOT a blockchain): a document's bytes are hashed on upload; anyone holding a
 * copy can recompute the hash and check it against the registered value here.
 */

/** Normalizes user-pasted hash input to a canonical 64-char lowercase hex, or null. */
export function normalizeSha256(input: string | null | undefined): string | null {
  if (!input) return null;
  const cleaned = String(input)
    .trim()
    .toLowerCase()
    .replace(/^0x/, '')
    .replace(/^sha-?256:/, '')
    .replace(/\s+/g, '');
  return /^[0-9a-f]{64}$/.test(cleaned) ? cleaned : null;
}

/** A short, display-friendly form of a hash: first 8 + last 6 chars. */
export function shortHash(hash: string): string {
  if (hash.length <= 18) return hash;
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`;
}
