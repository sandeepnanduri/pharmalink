import 'server-only';
import { prisma } from '@/lib/db';
import { assertSafeUrl } from '@/lib/net-guard.server';
import {
  hashApiKey,
  bearerFromHeader,
  signWebhook,
  subscribes,
  hasScope,
  type ApiScope,
  type WebhookEvent,
} from '@/lib/integrations';

/**
 * SSRF guard for webhook endpoints. A webhook URL is fetched by our server, so
 * an unchecked URL lets any tenant point us at internal infrastructure (cloud
 * metadata, loopback, RFC1918…). We require https on the default port and reject
 * any URL whose host resolves to a non-public address — the shared check in
 * net-guard. Verified on BOTH create and dispatch (DNS can rebind between them),
 * and the fetch uses redirect:'error' so a 3xx to an internal host can't bypass.
 */
export async function isSafeWebhookUrl(raw: string): Promise<boolean> {
  return (await assertSafeUrl(raw, { schemes: ['https:'], defaultPortOnly: true })) !== null;
}

export interface ApiPrincipal {
  keyId: string;
  orgId: string | null;
  scopes: string;
}

/**
 * Authenticates an inbound API request by its Bearer key. Looks the key up by
 * its hash (never by the raw value), checks it is active, and stamps lastUsedAt.
 */
export async function authenticateApiKey(request: Request): Promise<ApiPrincipal | null> {
  const raw = bearerFromHeader(request.headers.get('authorization'));
  if (!raw) return null;

  const key = await prisma.apiKey.findUnique({
    where: { hashedKey: hashApiKey(raw) },
    select: { id: true, orgId: true, scopes: true, active: true, revokedAt: true },
  });
  if (!key || !key.active || key.revokedAt) return null;

  // Fire-and-forget usage stamp; must not slow the request.
  void prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
  return { keyId: key.id, orgId: key.orgId, scopes: key.scopes };
}

export function requireScope(principal: ApiPrincipal, scope: ApiScope): boolean {
  return hasScope(principal.scopes, scope);
}

/**
 * Delivers a domain event to every subscribed webhook.
 *
 * Best-effort and non-blocking: a partner's slow or dead endpoint must never
 * delay the buyer/seller action that produced the event. Each attempt is logged
 * so partners can debug their receiver. In production this would be a queue
 * consumer (ARCHITECTURE.md §5); here it fires inline with a short timeout.
 */
export async function dispatchEvent(
  event: WebhookEvent,
  data: Record<string, unknown>,
  scope: { orgId?: string | null } = {}
): Promise<void> {
  const hooks = await prisma.webhook.findMany({
    where: {
      active: true,
      // Platform-wide hooks (orgId null) always fire; org hooks fire for their org.
      OR: [{ orgId: null }, ...(scope.orgId ? [{ orgId: scope.orgId }] : [])],
    },
    select: { id: true, url: true, secret: true, events: true },
  });

  const targets = hooks.filter((h) => subscribes(h.events, event));
  if (targets.length === 0) return;

  const payload = JSON.stringify({
    event,
    // No Date.now() available in some contexts; use a plain timestamp here (server action).
    data,
  });

  await Promise.allSettled(
    targets.map(async (h) => {
      // Re-validate at dispatch time: the URL passed the check on create, but DNS
      // can be rebound to an internal address between then and now.
      if (!(await isSafeWebhookUrl(h.url))) {
        await prisma.webhookDelivery.create({
          data: { webhookId: h.id, event, status: 'failed', error: 'blocked: non-public URL' },
        }).catch(() => undefined);
        return;
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      try {
        const res = await fetch(h.url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-pharmalink-event': event,
            'x-pharmalink-signature': signWebhook(h.secret, payload),
          },
          body: payload,
          signal: controller.signal,
          redirect: 'error', // a 3xx to an internal host must not bypass the guard
        });
        await prisma.webhookDelivery.create({
          data: { webhookId: h.id, event, status: res.ok ? 'delivered' : 'failed', statusCode: res.status },
        });
        await prisma.webhook.update({
          where: { id: h.id },
          data: res.ok ? { lastEventAt: new Date(), failCount: 0 } : { failCount: { increment: 1 } },
        });
      } catch (err) {
        await prisma.webhookDelivery.create({
          data: { webhookId: h.id, event, status: 'failed', error: String(err).slice(0, 200) },
        });
        await prisma.webhook.update({ where: { id: h.id }, data: { failCount: { increment: 1 } } }).catch(() => undefined);
      } finally {
        clearTimeout(timer);
      }
    })
  );
}

/**
 * API responses carry organization-scoped, auth-gated data — they must NEVER be
 * cached. Without this a browser (or intermediary) can heuristically cache a 200
 * and keep serving it after the key is revoked or the data changes.
 */
const NO_STORE = { 'cache-control': 'no-store' } as const;

/** Standard JSON success shape for the public API (never cached). */
export function apiJson(data: unknown, status = 200) {
  return Response.json(data, { status, headers: NO_STORE });
}

/** Standard JSON error shape for the public API (never cached). */
export function apiError(status: number, message: string) {
  return Response.json({ error: message }, { status, headers: NO_STORE });
}
