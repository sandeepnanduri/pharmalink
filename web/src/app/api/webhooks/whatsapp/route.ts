import { prisma } from '@/lib/db';
import { verifyWebhook } from '@/lib/integrations';

/**
 * WhatsApp Business API inbound webhook.
 *
 * GET handles Meta's one-time verification handshake. POST receives real
 * message events, signature-verified via the SAME verifyWebhook helper
 * this app's own outbound webhooks already use (lib/integrations.ts) —
 * Meta's `X-Hub-Signature-256` is the identical HMAC-SHA256-over-the-raw-
 * body shape, just with an `sha256=` prefix to strip first.
 *
 * Deliberately does NOT trigger any state-changing action on an inbound
 * message — only logs it and sends a plain acknowledgment. Wiring a real
 * two-way action (approve/decline something) to this endpoint needs Meta's
 * actual interactive-message payload verified against a live account
 * first; doing that blind, against an unverified webhook, is exactly the
 * kind of mistake worth not making. See PARTNER-USP-ROADMAP.md.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token && process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    return new Response(challenge ?? '', { status: 200 });
  }
  return new Response('Forbidden', { status: 403 });
}

export async function POST(request: Request) {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) return new Response('Not configured', { status: 503 });

  const rawBody = await request.text();
  const header = request.headers.get('x-hub-signature-256') ?? '';
  const signature = header.startsWith('sha256=') ? header.slice('sha256='.length) : '';
  if (!signature || !verifyWebhook(appSecret, rawBody, signature)) {
    return new Response('Invalid signature', { status: 401 });
  }

  let phone: string | null = null;
  try {
    const body = JSON.parse(rawBody);
    // Meta's Cloud API payload shape: entry[].changes[].value.messages[].from
    phone = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.from ?? null;
  } catch {
    return new Response('Bad payload', { status: 400 });
  }

  if (phone) {
    const user = await prisma.user.findFirst({ where: { phone, whatsappOptIn: true }, select: { id: true } });
    if (user) {
      await prisma.whatsAppDelivery.create({ data: { userId: user.id, kind: 'inbound', direction: 'inbound', status: 'delivered' } });
    }
  }

  // Meta requires a 200 within a few seconds regardless of what the message
  // contained — this endpoint's only job right now is "receive and log."
  return new Response('OK', { status: 200 });
}
