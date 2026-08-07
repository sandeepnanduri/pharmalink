import { isIP } from 'node:net';

/**
 * SSRF primitives shared by everything that fetches a user-supplied URL from the
 * server (webhooks, the content crawler). Pure + synchronous so it is unit
 * tested; the DNS-resolution half lives in `net-guard.server.ts`.
 *
 * The threat: our server fetching an attacker-chosen URL can be turned into a
 * proxy onto internal infrastructure — the cloud metadata endpoint
 * (169.254.169.254), loopback, or RFC1918/CGNAT/link-local/ULA hosts behind the
 * firewall. We reject any URL whose host is (or resolves to) a non-public IP.
 */

/** True if `ip` is a non-publicly-routable address (or not a parseable IP). */
export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 || a === 10 || a === 127 || // "this" network, private, loopback
      (a === 169 && b === 254) || // link-local + cloud metadata (169.254.169.254)
      (a === 172 && b >= 16 && b <= 31) || // private
      (a === 192 && b === 168) || // private
      (a === 100 && b >= 64 && b <= 127) || // CGNAT
      a >= 224 // multicast / reserved
    );
  }
  if (v === 6) {
    const lower = ip.toLowerCase().replace(/^\[|\]$/g, '');
    if (lower === '::1' || lower === '::') return true; // loopback / unspecified
    if (lower.startsWith('fe80') || lower.startsWith('fc') || lower.startsWith('fd')) return true; // link-local, ULA
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower); // IPv4-mapped
    if (mapped) return isPrivateAddress(mapped[1]);
    return false;
  }
  return true; // not a parseable IP → treat as unsafe
}

export interface UrlCheck {
  ok: boolean;
  url?: URL;
  /** Host is a literal IP already validated as public — no DNS lookup needed. */
  literalIpVerified?: boolean;
  reason?: string;
}

export interface UrlCheckOptions {
  /** Allowed URL schemes, with the colon (default: https only). */
  schemes?: string[];
  /** When true, reject any non-default port (blocks odd internal-service ports). */
  defaultPortOnly?: boolean;
}

/**
 * Synchronous half of the SSRF check: validate scheme/port/credentials and, for
 * literal-IP hosts, the address itself. Hostnames still need a DNS check (done
 * by the server half) — those return `ok:true` without `literalIpVerified`.
 */
export function checkPublicUrl(raw: string, opts: UrlCheckOptions = {}): UrlCheck {
  const schemes = opts.schemes ?? ['https:'];
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, reason: 'invalidUrl' };
  }
  if (!schemes.includes(u.protocol)) return { ok: false, reason: 'badScheme' };
  if (u.username || u.password) return { ok: false, reason: 'embeddedCreds' };
  if (opts.defaultPortOnly && u.port && u.port !== '443' && u.port !== '80') {
    return { ok: false, reason: 'badPort' };
  }
  const host = u.hostname;
  if (isIP(host)) {
    return isPrivateAddress(host)
      ? { ok: false, reason: 'privateHost' }
      : { ok: true, url: u, literalIpVerified: true };
  }
  return { ok: true, url: u }; // hostname — caller must still resolve + verify
}
