'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { saveNewsAction, toggleNewsAction, deleteNewsAction, type ActionState } from '@/lib/actions';
import { ConfirmSubmit } from './confirm-submit';
import { ButtonContent } from './spinner';
import { ActionFeedback } from '@/components/action-feedback';

export const NEWS_CATEGORIES = ['regulatory', 'market', 'supply', 'company'] as const;

interface PostRow {
  id: string;
  title: string;
  summary: string;
  category: string;
  locale: string;
  status: string;
  publishedAt: string | null;
  createdAt: string;
}

export function NewsAdmin({ posts }: { posts: PostRow[] }) {
  const t = useTranslations('news');
  const router = useRouter();

  const [state, action, pending] = useActionState<ActionState, FormData>(
    async (prev, fd) => {
      const res = await saveNewsAction(prev, fd);
      if (res.ok) router.refresh();
      return res;
    },
    {}
  );

  return (
    <div className="space-y-8">
      <section className="card">
        <h2 className="text-base font-bold">{t('newPost')}</h2>
        <form action={action} className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="n-cat">{t('category')}</label>
              <select id="n-cat" name="category" className="input" defaultValue="regulatory" data-testid="news-category">
                {NEWS_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{t(`cat${c[0].toUpperCase()}${c.slice(1)}`)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="n-loc">{t('locale')}</label>
              <select id="n-loc" name="locale" className="input" defaultValue="en" data-testid="news-locale">
                <option value="en">English</option>
                <option value="zh">中文</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label" htmlFor="n-title">{t('headline')}</label>
            <input id="n-title" name="title" required minLength={4} className="input" data-testid="news-title" />
          </div>
          <div>
            <label className="label" htmlFor="n-sum">{t('summary')}</label>
            <textarea id="n-sum" name="summary" required minLength={4} rows={2} className="input" data-testid="news-summary" />
          </div>
          <div>
            <label className="label" htmlFor="n-body">{t('body')}</label>
            <textarea id="n-body" name="body" rows={5} className="input" data-testid="news-body" />
          </div>
          <div>
            <label className="label" htmlFor="n-src">{t('sourceUrl')}</label>
            <input id="n-src" name="sourceUrl" type="url" className="input" placeholder="https://" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="publish" defaultChecked className="accent-brand" data-testid="news-publish" />
            {t('publish')}
          </label>
          {state.error && <p className="text-xs font-semibold text-red-700">{t(state.error)}</p>}
          <button type="submit" disabled={pending} className="btn-primary" data-testid="news-save">
            <ButtonContent pending={pending} label={t('save')} />
          </button>
              {/* Confirms the outcome — without it a silent re-render reads as "nothing happened" and users press submit again. */}
      <ActionFeedback state={state} success="Post saved" />
</form>
      </section>

      {posts.length > 0 && (
        <section>
          <h2 className="mb-3 text-base font-bold">{t('status')}</h2>
          <ul className="space-y-2">
            {posts.map((p) => (
              <li key={p.id} className="flex items-center gap-3 rounded-card border border-line bg-white p-3" data-testid="news-row">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[11px] text-muted">
                    <span className="chip">{p.category}</span>
                    <span className="uppercase">{p.locale}</span>
                    <span className={p.status === 'published' ? 'badge-verified' : 'badge-pending'}>
                      {p.status === 'published' ? t('published') : t('draft')}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-sm font-semibold">{p.title}</p>
                </div>
                <form action={toggleNewsAction}>
                  <input type="hidden" name="id" value={p.id} />
                  <button type="submit" className="text-xs font-semibold text-brand hover:underline" data-testid={`toggle-${p.id}`}>
                    {p.status === 'published' ? t('unpublish') : t('publish')}
                  </button>
                </form>
                <form action={deleteNewsAction}>
                  <input type="hidden" name="id" value={p.id} />
                  <ConfirmSubmit
                    className="text-xs font-semibold text-red-700 hover:underline"
                    confirm={t('deleteConfirm')}
                    label={t('delete')}
                    testId={`delete-news-${p.id}`}
                  />
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
