/**
 * Input sanitization for CMS content — pure + unit tested.
 *
 * Crawled/authored text is rendered through React (which auto-escapes), so the
 * job here is to (a) strip any markup out of "plain text" fields so it can't be
 * placed into an attribute/script context later, (b) collapse whitespace and cap
 * length, and (c) only ever accept http(s) URLs (never javascript:/data:).
 */

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'", nbsp: ' ' } as const;

/** Decodes the handful of HTML entities we expect in crawled titles/descriptions. */
export function decodeEntities(s: string): string {
  return s
    .replace(/&(amp|lt|gt|quot|apos|#39|nbsp);/g, (_, n: keyof typeof NAMED) => NAMED[n])
    .replace(/&#(\d+);/g, (_, d) => {
      const code = Number(d);
      return code > 0 && code < 0x10ffff ? String.fromCodePoint(code) : '';
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => {
      const code = parseInt(h, 16);
      return code > 0 && code < 0x10ffff ? String.fromCodePoint(code) : '';
    });
}

/** Strips tags + entities, collapses whitespace, and caps length. Returns ''. */
export function cleanText(input: string | null | undefined, maxLen = 500): string {
  if (!input) return '';
  const noTags = String(input).replace(/<[^>]*>/g, ' '); // drop any markup
  const decoded = decodeEntities(noTags);
  const collapsed = decoded.replace(/\s+/g, ' ').trim();
  return collapsed.length > maxLen ? collapsed.slice(0, maxLen).trimEnd() + '…' : collapsed;
}

/**
 * Returns the URL string only if it is a well-formed http(s) URL, else null.
 * Blocks javascript:, data:, vbscript:, file:, etc. — the classic href XSS sinks.
 */
export function safeHttpUrl(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = String(input).trim();
  try {
    const u = new URL(trimmed);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Normalizes a body of prose: strips tags, decodes entities, and preserves
 * paragraph breaks (double newlines) while collapsing incidental whitespace.
 */
export function cleanBody(input: string | null | undefined, maxLen = 20000): string {
  if (!input) return '';
  const noTags = String(input).replace(/<[^>]*>/g, ' ');
  const decoded = decodeEntities(noTags);
  const normalized = decoded
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return normalized.length > maxLen ? normalized.slice(0, maxLen).trimEnd() + '…' : normalized;
}
