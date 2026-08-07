/**
 * CMS content domain — pure constants + helpers shared by the admin UI, the
 * server actions and the public pages. No DB/Next imports so it is unit tested.
 */

/** A content item is either authored in the CMS (article) or a crawled link. */
export const CONTENT_KINDS = ['article', 'link'] as const;
export type ContentKind = (typeof CONTENT_KINDS)[number];

export const CONTENT_CATEGORIES = ['news', 'insight', 'resource', 'announcement', 'event'] as const;
export type ContentCategory = (typeof CONTENT_CATEGORIES)[number];

export const CONTENT_STATUSES = ['draft', 'published', 'archived'] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export function isValidCategory(c: string): c is ContentCategory {
  return (CONTENT_CATEGORIES as readonly string[]).includes(c);
}

/** A link item points off-site; an article is read on our own detail page. */
export function contentHref(item: { id: string; kind: string; sourceUrl: string | null }): string {
  return item.kind === 'link' && item.sourceUrl ? item.sourceUrl : `/content/${item.id}`;
}

/** True if the item should open in a new tab (external link items). */
export function isExternal(item: { kind: string; sourceUrl: string | null }): boolean {
  return item.kind === 'link' && !!item.sourceUrl;
}

/** A published item scheduled for now-or-earlier is publicly visible. */
export function isLive(
  item: { status: string; publishedAt: Date | null },
  now: Date = new Date(),
): boolean {
  return item.status === 'published' && !!item.publishedAt && item.publishedAt.getTime() <= now.getTime();
}
