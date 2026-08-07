import { NextResponse } from 'next/server';
import { API_SCOPES, WEBHOOK_EVENTS } from '@/lib/integrations';
import { SITE_URL } from '@/lib/seo';

/** Public API discovery document — what a partner needs to start integrating. */
export function GET() {
  return NextResponse.json({
    name: 'PharmaLink Open API',
    version: '1',
    documentation: `${SITE_URL}/developers`,
    authentication: 'Bearer <api-key>  (create one under Account → Integrations)',
    scopes: API_SCOPES,
    endpoints: {
      products: '/api/v1/products?q=&cas=&cert=&country=',
      product: '/api/v1/products/{id}',
      suppliers: '/api/v1/suppliers?country=',
      rfqs: '/api/v1/rfqs   (org-scoped; requires rfq:read)',
    },
    webhooks: {
      events: WEBHOOK_EVENTS,
      signature: 'x-pharmalink-signature: HMAC-SHA256(secret, rawBody)',
    },
  });
}
