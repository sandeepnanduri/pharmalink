import { describe, it, expect } from 'vitest';
import {
  validateUpload,
  sha256,
  storageKeyFor,
  safeFilename,
  MAX_UPLOAD_BYTES,
} from './storage';

describe('validateUpload', () => {
  it('accepts a normal PDF', () => {
    expect(validateUpload({ size: 1024, type: 'application/pdf' })).toEqual({ ok: true, ext: 'pdf' });
  });

  it('accepts scanned certificates as png/jpeg', () => {
    expect(validateUpload({ size: 10, type: 'image/png' })).toEqual({ ok: true, ext: 'png' });
    expect(validateUpload({ size: 10, type: 'image/jpeg' })).toEqual({ ok: true, ext: 'jpg' });
  });

  it('rejects an empty file', () => {
    expect(validateUpload({ size: 0, type: 'application/pdf' })).toEqual({ ok: false, reason: 'empty' });
  });

  it('rejects anything over the size cap', () => {
    expect(validateUpload({ size: MAX_UPLOAD_BYTES + 1, type: 'application/pdf' })).toEqual({
      ok: false,
      reason: 'too-large',
    });
  });

  it('rejects executables and scripts masquerading as documents', () => {
    for (const type of ['application/x-msdownload', 'text/html', 'application/javascript', '']) {
      expect(validateUpload({ size: 100, type })).toEqual({ ok: false, reason: 'bad-type' });
    }
  });
});

describe('sha256', () => {
  it('matches the known digest of a known input', () => {
    // Well-known vector: sha256("abc")
    expect(sha256(Buffer.from('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
  });

  it('is stable for identical bytes and differs for a single-bit change', () => {
    expect(sha256(Buffer.from('cert-v1'))).toBe(sha256(Buffer.from('cert-v1')));
    expect(sha256(Buffer.from('cert-v1'))).not.toBe(sha256(Buffer.from('cert-v2')));
  });
});

describe('storageKeyFor', () => {
  it('scopes the key by org and keeps the extension', () => {
    const key = storageKeyFor('org_123', 'pdf');
    expect(key.startsWith('org/org_123/')).toBe(true);
    expect(key.endsWith('.pdf')).toBe(true);
  });

  it('is unguessable — two calls never collide', () => {
    const a = storageKeyFor('org_123', 'pdf');
    const b = storageKeyFor('org_123', 'pdf');
    expect(a).not.toBe(b);
  });

  it('does not leak the original filename', () => {
    expect(storageKeyFor('org_1', 'pdf')).not.toContain('secret');
  });
});

describe('safeFilename', () => {
  it('strips directory traversal attempts', () => {
    expect(safeFilename('../../etc/passwd')).toBe('passwd');
    expect(safeFilename('C:\\Windows\\system32\\evil.pdf')).not.toContain('\\');
  });

  it('removes characters that could break headers', () => {
    expect(safeFilename('cert"; rm -rf /.pdf')).not.toContain('"');
  });

  it('never returns an empty name', () => {
    expect(safeFilename('///')).toBe('document');
    expect(safeFilename('')).toBe('document');
  });

  it('keeps a sensible name intact', () => {
    expect(safeFilename('FDA_GMP_2026.pdf')).toBe('FDA_GMP_2026.pdf');
  });
});
