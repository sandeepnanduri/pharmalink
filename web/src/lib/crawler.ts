import { cleanText, safeHttpUrl } from './sanitize';

/**
 * Pure HTML → metadata extraction for the link crawler. Regex-based (no DOM
 * dependency) reading of Open Graph / Twitter Card / standard meta tags — the
 * signals virtually every publisher emits for link unfurling. Every string is
 * run through cleanText and every URL through safeHttpUrl, so nothing that
 * reaches the CMS is unsanitized.
 */

export interface LinkMetadata {
  title: string;
  summary: string;
  imageUrl: string | null;
  sourceName: string | null;
  canonicalUrl: string | null;
}

/** Reads <meta property|name="key" content="value"> (either attribute order). */
function metaContent(html: string, key: string): string | null {
  const k = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // property/name before content
  const a = new RegExp(`<meta[^>]+(?:property|name)=["']${k}["'][^>]+content=["']([^"']*)["']`, 'i').exec(html);
  if (a) return a[1];
  // content before property/name
  const b = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${k}["']`, 'i').exec(html);
  return b ? b[1] : null;
}

/** Reads href of <link rel="canonical">. */
function linkHref(html: string, rel: string): string | null {
  const a = new RegExp(`<link[^>]+rel=["']${rel}["'][^>]+href=["']([^"']*)["']`, 'i').exec(html);
  if (a) return a[1];
  const b = new RegExp(`<link[^>]+href=["']([^"']*)["'][^>]+rel=["']${rel}["']`, 'i').exec(html);
  return b ? b[1] : null;
}

/** Resolves a possibly-relative URL against the page URL; returns safe http(s) only. */
function resolveUrl(value: string | null, baseUrl: string): string | null {
  if (!value) return null;
  try {
    return safeHttpUrl(new URL(value, baseUrl).toString());
  } catch {
    return null;
  }
}

export function extractMetadata(html: string, baseUrl: string): LinkMetadata {
  const titleTag = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);

  const rawTitle =
    metaContent(html, 'og:title') ??
    metaContent(html, 'twitter:title') ??
    (titleTag ? titleTag[1] : '') ??
    '';

  const rawSummary =
    metaContent(html, 'og:description') ??
    metaContent(html, 'twitter:description') ??
    metaContent(html, 'description') ??
    '';

  const image = resolveUrl(metaContent(html, 'og:image') ?? metaContent(html, 'twitter:image'), baseUrl);
  const canonical = resolveUrl(linkHref(html, 'canonical') ?? metaContent(html, 'og:url'), baseUrl);

  let sourceName = cleanText(metaContent(html, 'og:site_name'), 80) || null;
  if (!sourceName) {
    try {
      sourceName = new URL(baseUrl).hostname.replace(/^www\./, '');
    } catch {
      sourceName = null;
    }
  }

  return {
    title: cleanText(rawTitle, 200),
    summary: cleanText(rawSummary, 500),
    imageUrl: image,
    sourceName,
    canonicalUrl: canonical,
  };
}
