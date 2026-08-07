import type { MetadataRoute } from 'next';
import { prisma } from '@/lib/db';
import { routing } from '@/i18n/routing';
import { absoluteUrl, localeAlternates } from '@/lib/seo';

/**
 * Dynamic sitemap: static pages plus every live product and verified supplier,
 * each with per-locale hreflang alternates. Search engines discover the whole
 * public catalogue from here — the organic-growth engine the MVP is built on.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPaths = ['', '/catalog', '/pricing', '/login', '/signup'];

  const [products, suppliers] = await Promise.all([
    prisma.product.findMany({
      where: { status: 'live', org: { status: 'verified' } },
      select: { id: true, updatedAt: true },
      take: 5000,
    }),
    prisma.organization.findMany({
      where: { status: 'verified', kind: { in: ['seller', 'both'] } },
      select: { id: true, updatedAt: true },
      take: 5000,
    }),
  ]);

  const entry = (path: string, lastModified?: Date, priority = 0.6): MetadataRoute.Sitemap[number] => ({
    url: absoluteUrl(routing.defaultLocale, path),
    lastModified: lastModified ?? new Date(),
    changeFrequency: 'weekly',
    priority,
    alternates: { languages: localeAlternates(path) },
  });

  return [
    entry('', undefined, 1),
    ...staticPaths.slice(1).map((p) => entry(p, undefined, p === '/catalog' ? 0.9 : 0.5)),
    ...products.map((p) => entry(`/products/${p.id}`, p.updatedAt, 0.8)),
    ...suppliers.map((s) => entry(`/suppliers/${s.id}`, s.updatedAt, 0.7)),
  ];
}
