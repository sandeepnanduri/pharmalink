import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { ApiScope, WebhookEvent } from './integrations.constants';

/**
 * Open-API credentials + webhook signing.
 *
 * Design rules:
 *  - The raw API key is shown to the partner exactly ONCE. We store only its
 *    SHA-256 hash, so a database leak yields no usable key.
 *  - Webhook payloads are signed with HMAC-SHA256 so the receiver can prove the
 *    request came from us and was not tampered with.
 *
 * Pure functions (crypto only) so the security-critical bits are unit-tested.
 * The scope/event CONSTANTS live in `integrations.constants.ts` (no node:crypto)
 * so client components can import them; this module re-exports for convenience.
 */

export { API_SCOPES, WEBHOOK_EVENTS } from './integrations.constants';
export type { ApiScope, WebhookEvent } from './integrations.constants';

const KEY_PREFIX = 'plk';

/** Generates a new API key. Returns the raw key (show once) + what to persist. */
export function generateApiKey(live = true): { raw: string; prefix: string; hashedKey: string } {
  const secret = randomBytes(24).toString('base64url');
  const raw = `${KEY_PREFIX}_${live ? 'live' : 'test'}_${secret}`;
  return { raw, prefix: raw.slice(0, 16), hashedKey: hashApiKey(raw) };
}

export function hashApiKey(raw: string): string {
  return createHash('sha256').update(raw.trim()).digest('hex');
}

/** Extracts a Bearer key from an Authorization header (or null). */
export function bearerFromHeader(header: string | null): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  return m ? m[1].trim() : null;
}

export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString('base64url')}`;
}

/** HMAC-SHA256 signature of a raw JSON body, hex-encoded. */
export function signWebhook(secret: string, body: string): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

/** Constant-time signature check — never leak timing about the secret. */
export function verifyWebhook(secret: string, body: string, signature: string): boolean {
  const expected = signWebhook(secret, body);
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function hasScope(granted: string | null | undefined, scope: ApiScope): boolean {
  return (granted ?? '').split(/\s+/).filter(Boolean).includes(scope);
}

/** True if a comma-separated subscription list (or "*") includes an event. */
export function subscribes(events: string, event: WebhookEvent): boolean {
  if (events.trim() === '*') return true;
  return events.split(',').map((e) => e.trim()).includes(event);
}
