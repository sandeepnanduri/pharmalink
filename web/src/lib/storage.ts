import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';

/**
 * Document storage + integrity (BACKLOG F2.3, F7.2; ARCHITECTURE.md §7, §8.2).
 *
 * Files NEVER get a public URL. They are written to a private store under an
 * opaque key and served only through /api/documents/[id], which re-checks
 * authorization and writes an audit event on every read.
 *
 * The dev implementation is local disk; the ObjectStore interface is the seam
 * for S3 / Azure Blob in production (same keys, same call sites).
 */

/** Uploads accepted for regulatory documents. Deliberately narrow. */
export const ALLOWED_MIME: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
};

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

export type UploadRejection = 'empty' | 'too-large' | 'bad-type';

/** Validates an upload before a single byte is persisted. */
export function validateUpload(input: {
  size: number;
  type: string;
}): { ok: true; ext: string } | { ok: false; reason: UploadRejection } {
  if (!input.size) return { ok: false, reason: 'empty' };
  if (input.size > MAX_UPLOAD_BYTES) return { ok: false, reason: 'too-large' };
  const ext = ALLOWED_MIME[input.type];
  if (!ext) return { ok: false, reason: 'bad-type' };
  return { ok: true, ext };
}

/** SHA-256 of the bytes — document integrity + verify-by-hash (R18 precursor). */
export function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

/**
 * Opaque storage key. Scoped by org so a leaked key reveals nothing about the
 * document, and randomised so keys are never guessable from the filename.
 */
export function storageKeyFor(orgId: string, ext: string): string {
  return `org/${orgId}/${randomUUID()}.${ext}`;
}

/** Strips any path components a client may have smuggled into the filename. */
export function safeFilename(name: string): string {
  const base = path.basename(name).replace(/[^\w.\- ]+/g, '_').trim();
  return base.slice(0, 180) || 'document';
}

export interface ObjectStore {
  put(key: string, body: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}

const ROOT = process.env.UPLOAD_DIR ?? path.join(process.cwd(), '.uploads');

/** Local-disk store for dev/CI. Swap for S3/Blob in prod — same interface. */
class LocalDiskStore implements ObjectStore {
  private resolve(key: string): string {
    const full = path.resolve(ROOT, key);
    // Defence in depth: a key must never escape the storage root.
    if (!full.startsWith(path.resolve(ROOT))) throw new Error('invalid storage key');
    return full;
  }

  async put(key: string, body: Buffer): Promise<void> {
    const full = this.resolve(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, body);
  }

  async get(key: string): Promise<Buffer> {
    return readFile(this.resolve(key));
  }

  async remove(key: string): Promise<void> {
    await unlink(this.resolve(key)).catch(() => undefined);
  }
}

export const store: ObjectStore = new LocalDiskStore();
