import 'server-only';
import { lookup } from 'node:dns/promises';
import { checkPublicUrl, isPrivateAddress, type UrlCheckOptions } from './net-guard';

/** Resolves a hostname and returns true only if EVERY address is publicly routable. */
async function resolvesToPublicHost(host: string): Promise<boolean> {
  try {
    const addrs = await lookup(host, { all: true });
    return addrs.length > 0 && addrs.every((a) => !isPrivateAddress(a.address));
  } catch {
    return false; // unresolvable → don't fetch
  }
}

/**
 * Full SSRF check: scheme/port/creds + (for hostnames) DNS resolution against
 * the private-address blocklist. Returns the parsed URL when safe, else null.
 *
 * Re-checked at fetch time (not just on save) because DNS can change between the
 * two — a rebinding host that was public when validated can point inside later.
 * Callers must also fetch with `redirect: 'error'` so a 3xx to an internal host
 * can't slip past this.
 */
export async function assertSafeUrl(raw: string, opts?: UrlCheckOptions): Promise<URL | null> {
  const c = checkPublicUrl(raw, opts);
  if (!c.ok || !c.url) return null;
  if (c.literalIpVerified) return c.url; // literal IP already verified public
  return (await resolvesToPublicHost(c.url.hostname)) ? c.url : null;
}
