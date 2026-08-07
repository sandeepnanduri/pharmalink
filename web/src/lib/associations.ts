/**
 * Trade-association member importers — pure parsing half.
 *
 * ## Why these sources and not IndiaMART
 *
 * IndiaMART's Terms of Use prohibit systematic retrieval of their content to
 * build a directory, explicitly including manual collection. These three do not:
 *
 *   - **BDMA** (bdmai.org) — WordPress, permissive `robots.txt`, public sitemap.
 *   - **Pharmexcil** — the Government of India's pharmaceutical export promotion
 *     council; the member register is published, no `robots.txt` restrictions.
 *   - **IPA** (ipa-india.org) — permissive `robots.txt`; the member list is
 *     rendered client-side, so it needs a headless fetch rather than a plain GET.
 *
 * Membership is a WEAK signal and is treated as one. It says a company exists
 * and paid a subscription — not that it is GMP-certified. Imported organisations
 * therefore land as `draft` and must still pass ops verification, exactly like a
 * supplier who applied directly. Nothing here shortcuts that.
 */

export type AssociationId = 'bdma' | 'pharmexcil' | 'ipa';

export interface Association {
  id: AssociationId;
  name: string;
  fullName: string;
  host: string;
  membersUrl: string;
  /** How the member list is delivered — drives which fetch strategy is needed. */
  rendering: 'server' | 'client';
  /** What membership actually evidences. Shown in the ops console verbatim. */
  evidences: string;
}

export const ASSOCIATIONS: Association[] = [
  {
    id: 'bdma',
    name: 'BDMA',
    fullName: 'Bulk Drug Manufacturers Association (India)',
    host: 'bdmai.org',
    membersUrl: 'https://bdmai.org/members/',
    rendering: 'server',
    evidences: 'The company is a subscribing bulk-drug manufacturer member. Not a GMP certification.',
  },
  {
    id: 'pharmexcil',
    name: 'Pharmexcil',
    fullName: 'Pharmaceuticals Export Promotion Council of India',
    host: 'pharmexcil.com',
    membersUrl: 'https://pharmexcil.com/members',
    rendering: 'server',
    evidences: 'The company holds a Registration-cum-Membership Certificate for pharmaceutical export. Not a GMP certification.',
  },
  {
    id: 'ipa',
    name: 'IPA',
    fullName: 'Indian Pharmaceutical Alliance',
    host: 'www.ipa-india.org',
    membersUrl: 'https://www.ipa-india.org/members/',
    rendering: 'client',
    evidences: 'The company is one of the research-based member firms. Not a GMP certification.',
  },
];

export function association(id: string): Association | undefined {
  return ASSOCIATIONS.find((a) => a.id === id);
}

/** Hosts these importers may contact. Anything else is a bug, not a config. */
export const ASSOCIATION_HOSTS = ASSOCIATIONS.map((a) => a.host);

export interface ParsedMember {
  name: string;
  website: string | null;
  city: string | null;
  /** Natural key for idempotent re-import. */
  sourceRef: string;
}

/** Legal-form suffixes stripped before comparing two company names. */
const SUFFIXES = /\b(pvt|private|ltd|limited|inc|llc|plc|gmbh|co|corp|corporation|industries|laboratories|labs|pharmaceuticals?|pharma|chemicals?)\b/g;

/**
 * Normalises a company name for duplicate detection.
 *
 * "Sun Pharmaceutical Industries Ltd.", "SUN PHARMA", and "Sun Pharmaceuticals
 * Ltd" are one company; importing them as three is how a supplier directory
 * becomes useless. Suffixes and punctuation go, the rest is compared.
 */
export function normaliseCompany(name: string): string {
  return name
    .toLowerCase()
    // Apostrophes are REMOVED, not spaced: "Divi's" and "Divis" are the same
    // company, and spacing them apart makes the comparison fail.
    .replace(/['’]/g, '')
    .replace(/[.,"()&]/g, ' ')
    .replace(SUFFIXES, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** True when two names denote the same company after normalisation. */
export function sameCompany(a: string, b: string): boolean {
  const na = normaliseCompany(a);
  const nb = normaliseCompany(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  // One being a prefix of the other catches "Sun" vs "Sun Pharma Industries".
  return na.length > 4 && nb.length > 4 && (na.startsWith(nb) || nb.startsWith(na));
}

const CLEAN = (s: string) => s.replace(/\s+/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").trim();

/**
 * Extracts members from a directory page.
 *
 * Deliberately conservative: a row must yield a plausible company name to be
 * kept. A permissive parser on a page that changed layout silently imports
 * navigation labels and footer text as suppliers, which is worse than importing
 * nothing — a human then has to un-pick real records from junk.
 */
export function parseMemberList(html: string, assoc: Association): ParsedMember[] {
  const out = new Map<string, ParsedMember>();

  // Table rows and list items are the two shapes these registers actually use.
  const blocks = [...html.matchAll(/<(tr|li)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map((m) => m[2]);

  for (const block of blocks) {
    // The company name is the FIRST cell, not the flattened row: flattening
    // appends every link's text ("site", "view profile") to the name, which
    // both corrupts it and defeats deduplication.
    const cells = [...block.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => CLEAN(m[1].replace(/<[^>]+>/g, ' ')));
    const withoutLinks = CLEAN(block.replace(/<a[^>]*>[\s\S]*?<\/a>/gi, ' ').replace(/<[^>]+>/g, ' '));
    const candidate = cells.find(isPlausibleCompany) ?? withoutLinks;

    const name = CLEAN(candidate.split(/\s{2,}|\||,/)[0]).slice(0, 120);
    if (!isPlausibleCompany(name)) continue;

    const hrefs = [...block.matchAll(/href="(https?:\/\/[^"]+)"/gi)].map((m) => m[1]);
    // The member's own site, not a link back to the association.
    const website = hrefs.find((h) => !h.includes(assoc.host)) ?? null;

    const ref = `${assoc.id}:${normaliseCompany(name)}`;
    if (!out.has(ref)) out.set(ref, { name, website, city: null, sourceRef: ref });
  }

  return [...out.values()];
}

/** Filters out navigation labels, headings and other non-company text. */
export function isPlausibleCompany(text: string): boolean {
  const t = text.trim();
  if (t.length < 4 || t.length > 160) return false;
  if (!/[a-z]/i.test(t)) return false;
  // Must contain at least two words — single tokens are almost always nav items.
  if (t.split(/\s+/).length < 2) return false;
  // Common chrome that appears inside <li> on these sites.
  if (/^(home|about|contact|members?|login|register|read more|search|menu|privacy|terms|copyright|next|previous)\b/i.test(t)) return false;
  if (/@/.test(t) && !/\b(ltd|limited|pharma|labs?|industries|inc)\b/i.test(t)) return false;
  return true;
}
