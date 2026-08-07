'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { currentUser } from '@/lib/session';
import { can } from '@/lib/rbac';
import { routing } from '@/i18n/routing';
import { fetchLinkPreview } from '@/lib/crawler.server';
import { cleanText, cleanBody, safeHttpUrl } from '@/lib/sanitize';
import { isValidCategory, type ContentStatus } from '@/lib/content';

export type ContentActionState = {
  error?: string;
  ok?: boolean;
  id?: string;
  /** Populated by previewLinkAction so the form can prefill from the crawl. */
  preview?: {
    url: string;
    title: string;
    summary: string;
    imageUrl: string | null;
    sourceName: string | null;
    canonicalUrl: string | null;
  };
};

async function requireEditor() {
  const user = await currentUser();
  if (!user || !can(user.principal, 'admin:moderate')) return null;
  return user;
}

async function audit(action: string, entityId: string, actorId?: string) {
  await prisma.auditLog.create({
    data: { action, entity: 'ContentItem', entityId, actorId: actorId ?? null },
  });
}

function safeLocale(v: string): string {
  return (routing.locales as readonly string[]).includes(v) ? v : routing.defaultLocale;
}

function revalidateContent() {
  revalidatePath('/[locale]/admin/content', 'page');
  revalidatePath('/[locale]', 'page');
  revalidatePath('/[locale]/content', 'page');
}

/**
 * Crawl a pasted URL and return sanitized link metadata for the CMS form to
 * prefill. SSRF-guarded inside fetchLinkPreview; never mutates anything.
 */
export async function previewLinkAction(
  _prev: ContentActionState,
  formData: FormData,
): Promise<ContentActionState> {
  const user = await requireEditor();
  if (!user) return { error: 'unauthorized' };

  const url = String(formData.get('url') ?? '').trim();
  if (!safeHttpUrl(url)) return { error: 'invalidUrl' };

  const res = await fetchLinkPreview(url);
  if (!res.ok) return { error: res.error };

  return {
    ok: true,
    preview: {
      url: res.data.url,
      title: res.data.title,
      summary: res.data.summary,
      imageUrl: res.data.imageUrl,
      sourceName: res.data.sourceName,
      canonicalUrl: res.data.canonicalUrl,
    },
  };
}

/**
 * Create or update a content item (manual article OR crawled link). Everything
 * is sanitized here regardless of what the client sent.
 */
export async function saveContentAction(
  _prev: ContentActionState,
  formData: FormData,
): Promise<ContentActionState> {
  const user = await requireEditor();
  if (!user) return { error: 'unauthorized' };

  const id = String(formData.get('id') ?? '').trim() || null;
  const kind = String(formData.get('kind') ?? 'article') === 'link' ? 'link' : 'article';
  const title = cleanText(String(formData.get('title') ?? ''), 200);
  if (title.length < 3) return { error: 'titleTooShort' };

  const categoryRaw = String(formData.get('category') ?? 'news');
  const category = isValidCategory(categoryRaw) ? categoryRaw : 'news';
  const sourceUrl = safeHttpUrl(String(formData.get('sourceUrl') ?? ''));
  if (kind === 'link' && !sourceUrl) return { error: 'linkRequiresUrl' };

  const data = {
    kind,
    locale: safeLocale(String(formData.get('locale') ?? 'en')),
    title,
    summary: cleanText(String(formData.get('summary') ?? ''), 500) || null,
    body: kind === 'article' ? cleanBody(String(formData.get('body') ?? '')) || null : null,
    imageUrl: safeHttpUrl(String(formData.get('imageUrl') ?? '')),
    sourceUrl,
    sourceName: cleanText(String(formData.get('sourceName') ?? ''), 80) || null,
    category,
    tags: cleanText(String(formData.get('tags') ?? ''), 200) || null,
    featured: formData.get('featured') === 'on',
    sortOrder: Number(formData.get('sortOrder') ?? 0) || 0,
  };

  const publish = formData.get('publish') === 'on';
  const status: ContentStatus = publish ? 'published' : 'draft';

  // Dedup crawled links by canonical URL (unique). Reuse the existing row.
  const canonicalUrl = kind === 'link' ? safeHttpUrl(String(formData.get('canonicalUrl') ?? '')) ?? sourceUrl : null;

  try {
    if (id) {
      const existing = await prisma.contentItem.findUnique({ where: { id }, select: { publishedAt: true } });
      const item = await prisma.contentItem.update({
        where: { id },
        data: {
          ...data,
          canonicalUrl,
          status,
          publishedAt: publish ? (existing?.publishedAt ?? new Date()) : null,
          fetchedAt: kind === 'link' ? new Date() : undefined,
        },
      });
      await audit(publish ? 'content.published' : 'content.updated', item.id, user.id);
      revalidateContent();
      return { ok: true, id: item.id };
    }

    const item = await prisma.contentItem.create({
      data: {
        ...data,
        canonicalUrl,
        status,
        publishedAt: publish ? new Date() : null,
        fetchedAt: kind === 'link' ? new Date() : null,
        authorId: user.id,
      },
    });
    await audit(publish ? 'content.published' : 'content.created', item.id, user.id);
    revalidateContent();
    return { ok: true, id: item.id };
  } catch (e) {
    // Unique canonicalUrl violation → this link is already in the CMS.
    if (String(e).includes('Unique') || String(e).includes('constraint')) return { error: 'duplicateLink' };
    return { error: 'saveFailed' };
  }
}

export async function toggleContentAction(formData: FormData): Promise<void> {
  const user = await requireEditor();
  if (!user) return;
  const id = String(formData.get('id') ?? '');
  const post = await prisma.contentItem.findUnique({ where: { id }, select: { status: true } });
  if (!post) return;
  const publish = post.status !== 'published';
  await prisma.contentItem.update({
    where: { id },
    data: { status: publish ? 'published' : 'draft', publishedAt: publish ? new Date() : null },
  });
  await audit(publish ? 'content.published' : 'content.unpublished', id, user.id);
  revalidateContent();
}

export async function featureContentAction(formData: FormData): Promise<void> {
  const user = await requireEditor();
  if (!user) return;
  const id = String(formData.get('id') ?? '');
  const item = await prisma.contentItem.findUnique({ where: { id }, select: { featured: true } });
  if (!item) return;
  await prisma.contentItem.update({ where: { id }, data: { featured: !item.featured } });
  await audit('content.featured', id, user.id);
  revalidateContent();
}

export async function deleteContentAction(formData: FormData): Promise<void> {
  const user = await requireEditor();
  if (!user) return;
  const id = String(formData.get('id') ?? '');
  await prisma.contentItem.delete({ where: { id } }).catch(() => undefined);
  await audit('content.deleted', id, user.id);
  revalidateContent();
}
