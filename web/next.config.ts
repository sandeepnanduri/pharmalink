import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/**
 * Content-Security-Policy.
 *
 * Next's App Router injects inline hydration scripts and inline styles, and the
 * app renders inline JSON-LD, so a nonce-less policy needs 'unsafe-inline' for
 * script/style (and 'unsafe-eval' for React Refresh in dev). Even so, the policy
 * still hardens the high-value directives an XSS/clickjacking attacker relies on:
 * frame-ancestors 'none' (clickjacking), object-src 'none' (plugin/Flash XSS),
 * base-uri 'self' (base-tag hijack), form-action 'self' (credential exfil).
 * Tighten script-src to a nonce/hash strategy per ARCHITECTURE.md §8 later.
 */
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "connect-src 'self'",
].join('; ');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Emit a self-contained server bundle (.next/standalone) so the Docker runtime
  // image needs only Node + the traced deps — no full node_modules, no `next` CLI.
  output: 'standalone',
  // Don't advertise the framework — trims a trivial recon signal.
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          // HSTS is honoured only over HTTPS (browsers ignore it on http://localhost).
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
