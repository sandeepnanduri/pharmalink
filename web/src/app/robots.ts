import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Private, per-account areas must never be crawled or indexed. Public
        // discovery pages (catalog, product, supplier) stay open — they are the
        // organic-growth engine.
        disallow: ['/api/', '/*/buyer', '/*/seller', '/*/admin', '/*/account', '/*/billing', '/*/notifications', '/*/onboarding'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
