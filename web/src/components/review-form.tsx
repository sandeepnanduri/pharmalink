'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { submitReviewAction, type SocialActionState } from '@/lib/social-actions';
import { REVIEW_TAGS } from '@/lib/reviews';
import { ButtonContent } from './spinner';
import { ActionFeedback } from '@/components/action-feedback';

interface Existing {
  rating: number;
  title: string | null;
  body: string | null;
  tags: string | null;
}

/** Star picker + review form. Prefilled when the buyer already reviewed. */
export function ReviewForm({ supplierOrgId, existing }: { supplierOrgId: string; existing: Existing | null }) {
  const t = useTranslations('reviews');
  const router = useRouter();
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [hover, setHover] = useState(0);
  const selectedTags = new Set((existing?.tags ?? '').split(',').map((s) => s.trim()));

  const [state, action, pending] = useActionState<SocialActionState, FormData>(
    async (prev, fd) => {
      fd.set('rating', String(rating));
      const res = await submitReviewAction(prev, fd);
      if (res.ok) router.refresh();
      return res;
    },
    {},
  );

  return (
    <form action={action} className="card space-y-3" data-testid="review-form">
      <input type="hidden" name="supplierOrgId" value={supplierOrgId} />
      <h3 className="text-sm font-bold">{existing ? t('editYourReview') : t('writeReview')}</h3>

      <div className="flex items-center gap-1" role="radiogroup" aria-label={t('rating')}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setRating(n)}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            className={`text-2xl ${(hover || rating) >= n ? 'text-amber-500' : 'text-slate-300'}`}
            aria-label={`${n} ${t('stars')}`}
            data-testid={`star-${n}`}
          >
            ★
          </button>
        ))}
      </div>

      <div>
        <label className="label" htmlFor="rv-title">{t('title')}</label>
        <input id="rv-title" name="title" defaultValue={existing?.title ?? ''} className="input" data-testid="review-title" />
      </div>
      <div>
        <label className="label" htmlFor="rv-body">{t('body')}</label>
        <textarea id="rv-body" name="body" rows={3} defaultValue={existing?.body ?? ''} className="input" data-testid="review-body" />
      </div>

      <div>
        <p className="label">{t('tags')}</p>
        <div className="flex flex-wrap gap-2">
          {REVIEW_TAGS.map((tag) => (
            <label key={tag} className="flex items-center gap-1.5 text-xs text-slate2">
              <input type="checkbox" name="tags" value={tag} defaultChecked={selectedTags.has(tag)} className="accent-brand" />
              {tag}
            </label>
          ))}
        </div>
      </div>

      {state.error && <p className="text-xs font-semibold text-red-700">{t(state.error)}</p>}
      <button type="submit" disabled={pending || rating < 1} className="btn-primary" data-testid="review-submit">
        <ButtonContent pending={pending} label={existing ? t('update') : t('submit')} />
      </button>
          {/* Confirms the outcome — without it a silent re-render reads as "nothing happened" and users press submit again. */}
      <ActionFeedback state={state} success="Review published" />
</form>
  );
}
