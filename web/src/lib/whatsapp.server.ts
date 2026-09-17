import 'server-only';
import { prisma } from '@/lib/db';

/**
 * WhatsApp Business API integration — outbound sender.
 *
 * Gated entirely on environment variable presence, same pattern auth.ts's
 * googleEnabled()/samlEnabled() already use for optional providers: this
 * code is correct and testable today with zero live credentials, and simply
 * no-ops until WHATSAPP_ACCESS_TOKEN + WHATSAPP_PHONE_NUMBER_ID are set.
 *
 * Meta requires message TEMPLATES pre-approved for business-initiated sends
 * outside a customer-service window — `templateName` is never free text.
 * `pharmalink_notification` (title, body as its two params) is this app's
 * one generic template; getting it approved in Meta's console is a manual,
 * one-time setup step outside this codebase's control.
 */
export function whatsappEnabled(): boolean {
  return !!process.env.WHATSAPP_ACCESS_TOKEN && !!process.env.WHATSAPP_PHONE_NUMBER_ID;
}

/**
 * Sends one WhatsApp template message. Best-effort and non-blocking, same
 * discipline integrations.server.ts's dispatchEvent already documents for
 * org webhooks: a partner's WhatsApp delivery must never delay or fail the
 * action that triggered it. Every attempt — including a no-op when
 * disabled — is NOT logged when disabled (nothing was attempted); a real
 * attempt always logs, success or failure, so delivery history stays
 * truthful.
 */
export async function sendWhatsAppTemplate(userId: string, phone: string, kind: string, templateName: string, params: string[]): Promise<void> {
  if (!whatsappEnabled()) return; // no-op until real credentials exist — nothing to log

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(`https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phone,
        type: 'template',
        template: {
          name: templateName,
          language: { code: 'en' },
          components: [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text })) }],
        },
      }),
      signal: controller.signal,
    });
    await prisma.whatsAppDelivery.create({
      data: { userId, kind, direction: 'outbound', status: res.ok ? 'delivered' : 'failed', error: res.ok ? null : `HTTP ${res.status}` },
    });
  } catch (err) {
    await prisma.whatsAppDelivery.create({
      data: { userId, kind, direction: 'outbound', status: 'failed', error: String(err).slice(0, 200) },
    }).catch(() => undefined);
  } finally {
    clearTimeout(timer);
  }
}
