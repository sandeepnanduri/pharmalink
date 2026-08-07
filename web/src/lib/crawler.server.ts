import 'server-only';
import { assertSafeUrl } from './net-guard.server';
import { extractMetadata, type LinkMetadata } from './crawler';

const MAX_BYTES = 512 * 1024; // cap the HTML we read at 512 KB
const TIMEOUT_MS = 6000;
const MAX_REDIRECTS = 4;

export type PreviewError = 'blockedUrl' | 'notHtml' | 'fetchFailed' | 'tooLarge';
export type FetchPreviewResult =
  | { ok: true; data: LinkMetadata & { url: string } }
  | { ok: false; error: PreviewError };

/**
 * Fetches a user-supplied URL and extracts link metadata for the CMS preview.
 *
 * SSRF-hardened: the initial URL AND every redirect hop is re-validated against
 * the private-address blocklist (redirect:'manual' + assertSafeUrl per hop), so
 * a public URL that 3xx-redirects to an internal host is refused. The read is
 * capped by size, time, and content-type (HTML only).
 */
export async function fetchLinkPreview(rawUrl: string): Promise<FetchPreviewResult> {
  let current = await assertSafeUrl(rawUrl, { schemes: ['http:', 'https:'] });
  if (!current) return { ok: false, error: 'blockedUrl' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    let res: Response | null = null;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      res = await fetch(current.toString(), {
        method: 'GET',
        redirect: 'manual', // follow manually so each hop is re-validated
        headers: {
          'user-agent': 'PharmaLinkBot/1.0 (+https://pharmalink; link preview)',
          accept: 'text/html,application/xhtml+xml',
        },
        signal: controller.signal,
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location');
        if (!loc) return { ok: false, error: 'fetchFailed' };
        const next = await assertSafeUrl(new URL(loc, current.toString()).toString(), {
          schemes: ['http:', 'https:'],
        });
        if (!next) return { ok: false, error: 'blockedUrl' }; // redirect to internal host
        current = next;
        continue;
      }
      break; // non-redirect response
    }
    if (!res || !res.ok) return { ok: false, error: 'fetchFailed' };

    const ctype = res.headers.get('content-type') ?? '';
    if (!/text\/html|application\/xhtml/i.test(ctype)) return { ok: false, error: 'notHtml' };

    const reader = res.body?.getReader();
    if (!reader) return { ok: false, error: 'fetchFailed' };
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.length;
        if (total > MAX_BYTES) {
          controller.abort();
          return { ok: false, error: 'tooLarge' };
        }
        chunks.push(value);
      }
    }
    const html = Buffer.concat(chunks).toString('utf8');
    const meta = extractMetadata(html, current.toString());
    return { ok: true, data: { ...meta, url: current.toString() } };
  } catch {
    return { ok: false, error: 'fetchFailed' };
  } finally {
    clearTimeout(timer);
  }
}
