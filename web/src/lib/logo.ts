/**
 * Company logo resolution — pure, unit tested.
 *
 * ## Why not just scrape the logo off the supplier's website
 *
 * A logo is a trademark. Hotlinking one from the owner's server steals their
 * bandwidth and breaks the moment they reorganise their site; copying it into
 * our storage is a reproduction we have no licence for. Neither is a good
 * position for a platform whose selling point is that it checks things.
 *
 * So logos resolve through an aggregator keyed on the company's own domain,
 * with a deterministic monogram as the fallback. The monogram is not a
 * placeholder to be replaced later — for the long tail of small manufacturers
 * that have no logo asset anywhere, it IS the answer, and it looks deliberate.
 *
 * ## Two aggregators, and why the default is the keyless one
 *
 * `img.logo.dev` is the better service and the one to use at scale, but it
 * answers **401 without a publishable token**. The platform shipped for months
 * with no token issued, so every company on the site fell back to its monogram
 * and the requirement to show real supplier logos was quietly unmet — a working
 * state that looked deliberate, which is what made it survive so long.
 *
 * `unavatar.io` needs no key, so the default configuration now produces real
 * logos instead of a promise of them. Set `LOGO_DEV_TOKEN` and the licensed
 * service takes over with no code change.
 */

/** Hosts the resolver is allowed to point at. Anything else is a bug. */
export const LOGO_HOSTS = {
  /** Licensed. Used whenever a publishable token is configured. */
  licensed: 'img.logo.dev',
  /** Keyless default. */
  keyless: 'unavatar.io',
} as const;

/** Retained for callers and tests that predate the second provider. */
export const LOGO_HOST = LOGO_HOSTS.licensed;

export interface LogoInput {
  /** Company website, as entered. May be a bare domain or a full URL. */
  website?: string | null;
  /** Stored logo, if an operator has already set one. Always wins. */
  logoUrl?: string | null;
  name: string;
}

/**
 * Extracts a registrable domain from whatever the supplier typed.
 * Accepts "sunpharma.com", "https://www.sunpharma.com/about?x=1", "WWW.Cipla.COM".
 */
export function domainFrom(website: string | null | undefined): string | null {
  if (!website) return null;
  const raw = website.trim().toLowerCase();
  if (!raw) return null;
  let host: string;
  try {
    host = new URL(raw.includes('://') ? raw : `https://${raw}`).hostname;
  } catch {
    return null;
  }
  host = host.replace(/^www\./, '');
  // A domain needs at least one dot and no spaces; reject anything else rather
  // than building a URL that 404s on every render.
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) return null;
  return host;
}

/** Deterministic initials — same company always gets the same monogram. */
export function monogram(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    // Drop legal-form noise so "Sun Pharmaceutical Industries Ltd" is SP, not SL.
    .filter((w) => !['ltd', 'limited', 'inc', 'llc', 'plc', 'gmbh', 'srl', 'sa', 'bv', 'co', 'corp', 'pvt', 'private'].includes(w.toLowerCase()));
  if (words.length === 0) return '??';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/**
 * Deterministic brand colour for the monogram, from the company name.
 *
 * Hue is derived from a hash so it is stable across renders and servers;
 * saturation and lightness are fixed so every monogram sits in the same
 * legibility band and none of them fights the interface.
 */
export function monogramHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}

export interface ResolvedLogo {
  kind: 'image' | 'monogram';
  /** Set when kind is 'image'. */
  src?: string;
  /** Always set, so the UI can render the fallback if the image 404s. */
  initials: string;
  hue: number;
}

/**
 * Resolves the best available mark for a company.
 *
 * Precedence: an operator-set logo, then an aggregator keyed on the company
 * domain, then the monogram. `size` is capped because the licensed aggregator
 * bills per pixel bucket and an unbounded value from a caller would be a cost
 * bug.
 */
export function resolveLogo(input: LogoInput, opts: { size?: number; token?: string } = {}): ResolvedLogo {
  const initials = monogram(input.name);
  const hue = monogramHue(input.name);

  if (input.logoUrl) return { kind: 'image', src: input.logoUrl, initials, hue };

  const domain = domainFrom(input.website);
  if (!domain) return { kind: 'monogram', initials, hue };

  const size = Math.min(512, Math.max(32, Math.round(opts.size ?? 128)));

  if (opts.token) {
    const params = new URLSearchParams({ size: String(size), format: 'png', token: opts.token });
    return { kind: 'image', src: `https://${LOGO_HOSTS.licensed}/${domain}?${params}`, initials, hue };
  }

  // `fallback=false` is the load-bearing part. Left at its default, unavatar
  // answers 200 with a generic grey placeholder for a domain it has nothing
  // for — byte-identical across misses, verified by hashing two of them. The
  // browser would treat that as a successful load, so the company would show
  // an anonymous icon instead of its own initials, which is strictly worse than
  // the monogram. With the flag it 404s honestly and `onError` recovers.
  const params = new URLSearchParams({ fallback: 'false' });
  return { kind: 'image', src: `https://${LOGO_HOSTS.keyless}/${domain}?${params}`, initials, hue };
}
