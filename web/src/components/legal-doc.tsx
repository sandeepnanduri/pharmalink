import { Link } from '@/i18n/routing';

export type LegalSection = { h: string; p: string };

/**
 * Shared shell for the Terms and Privacy pages.
 *
 * Both documents are plain prose held in the message catalogs, so they stay
 * translatable and there is exactly one place to revise wording per locale.
 */
export function LegalDoc({
  eyebrow,
  title,
  updated,
  intro,
  sections,
  draftNote,
  otherHref,
  otherLabel,
}: {
  eyebrow: string;
  title: string;
  updated: string;
  intro: string;
  sections: LegalSection[];
  draftNote: string;
  otherHref: '/legal/terms' | '/legal/privacy';
  otherLabel: string;
}) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-12">
      <p className="text-xs font-bold uppercase tracking-wider text-brand">{eyebrow}</p>
      <h1 className="mt-1 text-2xl font-extrabold sm:text-3xl">{title}</h1>
      <p className="mt-1 text-sm text-muted">{updated}</p>

      <p className="mt-5 rounded-lg bg-warn-pale px-3 py-2 text-xs text-slate2">{draftNote}</p>

      <p className="mt-6 text-sm leading-relaxed text-slate2">{intro}</p>

      <ol className="mt-6 space-y-6">
        {sections.map((s, i) => (
          <li key={s.h}>
            <h2 className="text-base font-bold">
              {i + 1}. {s.h}
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-slate2">{s.p}</p>
          </li>
        ))}
      </ol>

      <p className="mt-10 border-t border-line pt-5 text-sm">
        <Link href={otherHref} className="font-semibold text-brand hover:underline">
          {otherLabel}
        </Link>
      </p>
    </div>
  );
}
