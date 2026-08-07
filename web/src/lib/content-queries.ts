import { prisma } from '@/lib/db';

/**
 * Read models for CMS content. Public queries only ever return published items
 * whose publishedAt is now-or-earlier (scheduling); the admin query returns all.
 */

const PUBLIC_WHERE = (locale: string) => ({
  status: 'published',
  locale,
  publishedAt: { not: null, lte: new Date() },
});

/** Featured items for the homepage "Spotlight" (curated order). */
export async function getFeaturedContent(locale: string, limit = 6) {
  return prisma.contentItem.findMany({
    where: { ...PUBLIC_WHERE(locale), featured: true },
    orderBy: [{ sortOrder: 'asc' }, { publishedAt: 'desc' }],
    take: limit,
  });
}

/** All published content for a locale (the public /content index). */
export async function getPublishedContent(locale: string, limit = 40) {
  return prisma.contentItem.findMany({
    where: PUBLIC_WHERE(locale),
    orderBy: [{ publishedAt: 'desc' }],
    take: limit,
  });
}

/** A single published article for its public detail page. */
export async function getPublicContentItem(id: string) {
  return prisma.contentItem.findFirst({ where: { id, status: 'published', kind: 'article' } });
}

/** Everything, any status — admin list. */
export async function getAllContent(limit = 100) {
  return prisma.contentItem.findMany({
    orderBy: [{ status: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }],
    take: limit,
  });
}
