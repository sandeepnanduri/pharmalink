'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import {
  previewLinkAction,
  saveContentAction,
  toggleContentAction,
  featureContentAction,
  deleteContentAction,
  type ContentActionState,
} from '@/lib/content-actions';
import { CONTENT_CATEGORIES } from '@/lib/content';
import { ConfirmSubmit } from './confirm-submit';
import { ButtonContent } from './spinner';
import { ActionFeedback } from '@/components/action-feedback';

export interface ContentRow {
  id: string;
  kind: string;
  locale: string;
  title: string;
  summary: string | null;
  body: string | null;
  imageUrl: string | null;
  sourceUrl: string | null;
  sourceName: string | null;
  canonicalUrl: string | null;
  category: string;
  tags: string | null;
  status: string;
  featured: boolean;
  sortOrder: number;
}

type Mode = 'article' | 'link';
type Draft = Partial<ContentRow> & { kind: string };

function CategorySelect({ value }: { value?: string }) {
  const t = useTranslations('content');
  return (
    <select name="category" defaultValue={value ?? 'news'} className="input" data-testid="content-category">
      {CONTENT_CATEGORIES.map((c) => (
        <option key={c} value={c}>{t(`cat_${c}`)}</option>
      ))}
    </select>
  );
}

/** The shared save form for an article or a (pre-filled) link. */
function ContentForm({ mode, draft, onSaved }: { mode: Mode; draft: Draft | null; onSaved: () => void }) {
  const t = useTranslations('content');
  const router = useRouter();
  const [state, action, pending] = useActionState<ContentActionState, FormData>(
    async (prev, fd) => {
      const res = await saveContentAction(prev, fd);
      if (res.ok) {
        router.refresh();
        onSaved();
      }
      return res;
    },
    {},
  );

  const d: Partial<ContentRow> = draft ?? {};
  return (
    <form action={action} className="space-y-3" data-testid={`content-form-${mode}`}>
      {d.id && <input type="hidden" name="id" value={d.id} />}
      <input type="hidden" name="kind" value={mode} />
      {mode === 'link' && (
        <>
          <input type="hidden" name="sourceUrl" value={d.sourceUrl ?? ''} />
          <input type="hidden" name="canonicalUrl" value={d.canonicalUrl ?? ''} />
          <input type="hidden" name="sourceName" value={d.sourceName ?? ''} />
          <input type="hidden" name="imageUrl" value={d.imageUrl ?? ''} />
          {d.sourceUrl && (
            <p className="truncate text-xs text-muted">
              🔗 {d.sourceName ? `${d.sourceName} — ` : ''}
              {d.sourceUrl}
            </p>
          )}
        </>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="c-cat">{t('category')}</label>
          <CategorySelect value={d.category} />
        </div>
        <div>
          <label className="label" htmlFor="c-loc">{t('locale')}</label>
          <select id="c-loc" name="locale" defaultValue={d.locale ?? 'en'} className="input" data-testid="content-locale">
            <option value="en">English</option>
            <option value="zh">中文</option>
          </select>
        </div>
      </div>

      <div>
        <label className="label" htmlFor="c-title">{t('title')}</label>
        <input id="c-title" name="title" required minLength={3} defaultValue={d.title ?? ''} className="input" data-testid="content-title" />
      </div>
      <div>
        <label className="label" htmlFor="c-sum">{t('summary')}</label>
        <textarea id="c-sum" name="summary" rows={2} defaultValue={d.summary ?? ''} className="input" data-testid="content-summary" />
      </div>

      {mode === 'article' ? (
        <>
          <div>
            <label className="label" htmlFor="c-body">{t('body')}</label>
            <textarea id="c-body" name="body" rows={6} defaultValue={d.body ?? ''} className="input" data-testid="content-body" />
          </div>
          <div>
            <label className="label" htmlFor="c-img">{t('imageUrl')}</label>
            <input id="c-img" name="imageUrl" type="url" defaultValue={d.imageUrl ?? ''} placeholder="https://" className="input" />
          </div>
        </>
      ) : (
        d.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={d.imageUrl} alt="" className="max-h-40 rounded-lg border border-line object-cover" />
        )
      )}

      <div>
        <label className="label" htmlFor="c-tags">{t('tags')}</label>
        <input id="c-tags" name="tags" defaultValue={d.tags ?? ''} placeholder={t('tagsHint')} className="input" />
      </div>

      <div className="flex flex-wrap items-center gap-5">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="featured" defaultChecked={d.featured ?? false} className="accent-brand" data-testid="content-featured" />
          {t('featured')}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span>{t('sortOrder')}</span>
          <input type="number" name="sortOrder" defaultValue={d.sortOrder ?? 0} className="input !w-20 !py-1" />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="publish" defaultChecked={d.status === 'published'} className="accent-brand" data-testid="content-publish" />
          {t('publishNow')}
        </label>
      </div>

      {state.error && <p className="text-xs font-semibold text-red-700">{t(state.error)}</p>}
      <button type="submit" disabled={pending} className="btn-primary" data-testid="content-save">
        <ButtonContent pending={pending} label={d.id ? t('update') : t('save')} />
      </button>
          {/* Confirms the outcome — without it a silent re-render reads as "nothing happened" and users press submit again. */}
      <ActionFeedback state={state} success="Content saved" />
</form>
  );
}

/** URL → crawl → preview, then hands the sanitized draft to ContentForm. */
function LinkImporter({ onPreview, draft }: { onPreview: (d: Draft) => void; draft: Draft | null }) {
  const t = useTranslations('content');
  const [state, action, pending] = useActionState<ContentActionState, FormData>(
    async (prev, fd) => {
      const res = await previewLinkAction(prev, fd);
      if (res.ok && res.preview) {
        onPreview({
          kind: 'link',
          title: res.preview.title,
          summary: res.preview.summary,
          imageUrl: res.preview.imageUrl,
          sourceUrl: res.preview.url,
          sourceName: res.preview.sourceName,
          canonicalUrl: res.preview.canonicalUrl,
          category: 'news',
        });
      }
      return res;
    },
    {},
  );

  return (
    <div className="space-y-3">
      <form action={action} className="flex gap-2">
        <input
          name="url"
          type="url"
          required
          placeholder="https://example.com/article"
          className="input"
          data-testid="link-url"
        />
        <button type="submit" disabled={pending} className="btn-ghost shrink-0" data-testid="link-fetch">
          <ButtonContent pending={pending} label={t('fetch')} />
        </button>
      </form>
      {state.error && <p className="text-xs font-semibold text-red-700">{t(state.error)}</p>}
      {draft?.kind === 'link' && <p className="text-xs text-ok" data-testid="link-preview-ready">✓ {t('previewReady')}</p>}
    </div>
  );
}

export function ContentManager({ items }: { items: ContentRow[] }) {
  const t = useTranslations('content');
  const [mode, setMode] = useState<Mode>('article');
  const [draft, setDraft] = useState<Draft | null>(null);

  const startNew = (m: Mode) => {
    setMode(m);
    setDraft(null);
  };
  const edit = (row: ContentRow) => {
    setMode(row.kind === 'link' ? 'link' : 'article');
    setDraft(row);
  };

  return (
    <div className="space-y-8">
      <section className="card">
        <div className="mb-4 flex items-center gap-2">
          <button
            type="button"
            onClick={() => startNew('article')}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${mode === 'article' ? 'bg-brand text-white' : 'bg-surface text-slate2'}`}
            data-testid="tab-article"
          >
            ✍️ {t('writeArticle')}
          </button>
          <button
            type="button"
            onClick={() => startNew('link')}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${mode === 'link' ? 'bg-brand text-white' : 'bg-surface text-slate2'}`}
            data-testid="tab-link"
          >
            🔗 {t('addLink')}
          </button>
          {draft?.id && (
            <span className="ml-auto text-xs text-muted">
              {t('editing')}: <span className="font-semibold">{draft.title}</span>{' '}
              <button type="button" onClick={() => startNew(mode)} className="text-brand hover:underline">
                ({t('cancelEdit')})
              </button>
            </span>
          )}
        </div>

        {/* key forces the uncontrolled form to reset when switching item/mode */}
        {mode === 'link' && !draft?.id && (
          <div className="mb-4 rounded-lg border border-line bg-surface p-3">
            <p className="mb-2 text-xs text-muted">{t('addLinkHint')}</p>
            <LinkImporter onPreview={setDraft} draft={draft} />
          </div>
        )}

        {(mode === 'article' || draft?.kind === 'link') && (
          <ContentForm
            key={`${mode}-${draft?.id ?? draft?.sourceUrl ?? 'new'}`}
            mode={mode}
            draft={draft}
            onSaved={() => setDraft(null)}
          />
        )}
      </section>

      {items.length > 0 && (
        <section>
          <h2 className="mb-3 text-base font-bold">{t('allContent')} ({items.length})</h2>
          <ul className="space-y-2">
            {items.map((it) => (
              <li key={it.id} className="flex items-center gap-3 rounded-card border border-line bg-white p-3" data-testid="content-row">
                {it.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.imageUrl} alt="" className="h-12 w-12 shrink-0 rounded object-cover" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                    <span className="chip">{it.kind === 'link' ? '🔗 ' + t('kindLink') : '✍️ ' + t('kindArticle')}</span>
                    <span className="chip">{t(`cat_${it.category}`)}</span>
                    <span className="uppercase">{it.locale}</span>
                    <span className={it.status === 'published' ? 'badge-verified' : 'badge-pending'}>
                      {it.status === 'published' ? t('published') : t(it.status)}
                    </span>
                    {it.featured && <span className="badge-info">★ {t('featured')}</span>}
                  </div>
                  <p className="mt-0.5 truncate text-sm font-semibold">{it.title}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-xs font-semibold">
                  <form action={featureContentAction}>
                    <input type="hidden" name="id" value={it.id} />
                    <button type="submit" className="text-slate2 hover:text-brand" title={t('toggleFeatured')} data-testid={`feature-${it.id}`}>
                      {it.featured ? '★' : '☆'}
                    </button>
                  </form>
                  <button type="button" onClick={() => edit(it)} className="text-brand hover:underline" data-testid={`edit-${it.id}`}>
                    {t('edit')}
                  </button>
                  <form action={toggleContentAction}>
                    <input type="hidden" name="id" value={it.id} />
                    <button type="submit" className="text-slate2 hover:underline" data-testid={`toggle-${it.id}`}>
                      {it.status === 'published' ? t('unpublish') : t('publish')}
                    </button>
                  </form>
                  <form action={deleteContentAction}>
                    <input type="hidden" name="id" value={it.id} />
                    <ConfirmSubmit
                      className="text-red-700 hover:underline"
                      confirm={t('deleteConfirm')}
                      label={t('delete')}
                      testId={`delete-${it.id}`}
                    />
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
