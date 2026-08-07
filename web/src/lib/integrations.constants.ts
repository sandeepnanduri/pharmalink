/**
 * Pure constants + types for the open API and webhooks.
 *
 * Kept free of `node:crypto` so client components (the integrations manager)
 * can import the scope/event lists without dragging Node crypto into the
 * browser bundle. The crypto lives in `integrations.ts` (server-only paths).
 */

export const API_SCOPES = ['catalog:read', 'rfq:read', 'suppliers:read'] as const;
export type ApiScope = (typeof API_SCOPES)[number];

/** Events a partner can subscribe a webhook to. Mirrors the domain events. */
export const WEBHOOK_EVENTS = [
  'rfq.posted',
  'quote.received',
  'quote.awarded',
  'rfq.cancelled',
  'org.verified',
  'product.published',
  'deal.created',
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];
