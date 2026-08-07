import { getTranslations } from 'next-intl/server';

/**
 * Hero visual: three scenes that cycle, each showing one step of the product
 * story — compare quotes, verify the supplier, track the order. One panel alone
 * read as a single confusing screenshot; the rotation tells the sequence.
 *
 * Every scene shares the same skeleton (header, three rows, footer) so the card
 * keeps one height and nothing jumps as they swap.
 *
 * Suppliers are deliberately ANONYMISED ("Verified supplier · India"). The seed
 * uses real company names, and putting illustrative prices next to a real
 * business on a public marketing page would misrepresent them.
 *
 * Pure CSS (no client JS, no external assets). Under prefers-reduced-motion the
 * scenes stop cycling and stack, so nothing is hidden behind an animation.
 */
export async function HeroShowcase() {
  const t = await getTranslations('heroShowcase');

  const quotes = [
    { origin: t('quote.originIndia'), price: '4.35', lead: t('quote.weeks', { n: 2 }), best: true },
    { origin: t('quote.originChina'), price: '4.55', lead: t('quote.weeks', { n: 3 }), best: false },
    { origin: t('quote.originGermany'), price: '5.10', lead: t('quote.weeks', { n: 4 }), best: false },
  ];
  const docs = [1, 2, 3].map((i) => ({ label: t(`verify.doc${i}`), meta: t(`verify.doc${i}Meta`) }));
  const steps = [1, 2, 3].map((i) => ({ label: t(`track.step${i}`), meta: t(`track.step${i}Meta`), done: i < 3 }));

  const scenes = [t('quote.eyebrow'), t('verify.eyebrow'), t('track.eyebrow')];

  return (
    <div className="pl-hs" role="img" aria-label={t('aria')}>
      <style>{`
        .pl-hs{
          position:relative;
          /* Accent palette — the only place these colours are declared. */
          --acc:#34d399;                       /* solid: price bars */
          --acc-text:#6ee7b7;                  /* legible on the dark panel */
          --acc-soft:rgba(52,211,153,.12);     /* chip / badge / winning row fill */
          --acc-line:rgba(52,211,153,.55);     /* winning row border */
          --acc-glow:52,211,153;               /* rgb triple for the pulse */
        }
        .pl-hs-acc{color:var(--acc-text)}
        .pl-hs-win{border-color:var(--acc-line);background:var(--acc-soft)}
        .pl-hs-pill{background:var(--acc-soft);color:var(--acc-text)}
        .pl-hs-tick{background:var(--acc-soft);color:var(--acc-text)}
        .pl-hs-stage{position:relative}
        .pl-hs-card{
          border:1px solid rgba(255,255,255,.16);
          background:linear-gradient(180deg,rgba(255,255,255,.13),rgba(255,255,255,.06));
          border-radius:18px;padding:18px;backdrop-filter:blur(6px);
          box-shadow:0 24px 60px -30px rgba(0,0,0,.75);
        }
        /* Scene 1 sits in normal flow and sets the height; 2 and 3 overlay it. */
        .pl-hs-scene{animation:plhsScene 16.5s ease-in-out infinite both}
        .pl-hs-scene+.pl-hs-scene{position:absolute;inset:0}
        @keyframes plhsScene{
          0%{opacity:0;transform:translateY(10px)}
          3%,30%{opacity:1;transform:none}
          34%,100%{opacity:0;transform:translateY(-10px)}
        }
        /* Rows stagger in. Same 16.5s period as the scenes so each row re-enters
           when its own scene comes round, instead of drifting against it. Kept as
           its own class so no other rule can claim the animation shorthand on the
           same element and cancel the fade. */
        .pl-hs-row{opacity:0;animation:plhsRow 16.5s ease-in-out infinite both}
        @keyframes plhsRow{0%{opacity:0;transform:translateY(6px)}4%,100%{opacity:1;transform:none}}
        /* The winning row breathes — on a wrapper, never on the row itself. */
        @keyframes plhsGlow{0%,100%{box-shadow:0 0 0 0 rgba(var(--acc-glow),.45)}50%{box-shadow:0 0 0 8px rgba(var(--acc-glow),0)}}
        .pl-hs-best{animation:plhsGlow 2.8s ease-out infinite;border-radius:12px}
        /* scaleX, not width: the inline width is the target length, so animating
           width to a percentage would resolve against the track instead. */
        @keyframes plhsBar{0%{transform:scaleX(0)}8%,100%{transform:scaleX(1)}}
        .pl-hs-bar{transform-origin:left center;animation:plhsBar 16.5s cubic-bezier(.2,.7,.3,1) infinite both}
        @keyframes plhsDot{0%,100%{opacity:.25}8%,30%{opacity:1}}
        .pl-hs-dot{width:16px;height:3px;border-radius:99px;background:var(--acc-text);opacity:.25;animation:plhsDot 16.5s ease-in-out infinite}
        @media (prefers-reduced-motion:reduce){
          .pl-hs-scene,.pl-hs-scene+.pl-hs-scene{position:static;animation:none;opacity:1;transform:none}
          .pl-hs-scene+.pl-hs-scene{margin-top:14px}
          .pl-hs-row,.pl-hs-best,.pl-hs-bar,.pl-hs-dot{animation:none;opacity:1;transform:none}
          .pl-hs-dots{display:none}
        }
      `}</style>

      <div className="pl-hs-stage">
        {/* 1 — compare quotes side by side */}
        <section className="pl-hs-scene pl-hs-card" style={{ animationDelay: '0s' }}>
          <Header eyebrow={t('quote.eyebrow')} title={t('quote.title')} sub={t('quote.sub')} chip="3" chipLabel={t('quote.matched')} />
          <div className="mt-4 space-y-2">
            {quotes.map((q, i) => (
              <div key={q.origin} className={q.best ? 'pl-hs-best' : undefined}>
                <div
                  className={`pl-hs-row flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
                    q.best ? 'pl-hs-win' : 'border-white/10 bg-white/5'
                  }`}
                  style={{ animationDelay: `${0.25 + i * 0.16}s` }}
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-white">
                      <span className="pl-hs-acc" aria-hidden>✓</span>
                      {q.origin}
                    </p>
                    {/* bar length = this quote's price against the highest */}
                    <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white/10">
                      <div
                        className="pl-hs-bar h-full rounded-full"
                        style={{
                          width: `${(Number.parseFloat(q.price) / 5.1) * 100}%`,
                          background: q.best ? 'var(--acc)' : 'rgba(255,255,255,.45)',
                          animationDelay: `${0.35 + i * 0.16}s`,
                        }}
                      />
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-mono text-sm font-bold tabular-nums text-white">${q.price}</p>
                    <p className="text-[10px] text-white/55">{q.lead}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <Footer note={t('quote.footnote')} badge={t('quote.badge')} />
        </section>

        {/* 2 — the verification behind that "verified supplier" tick */}
        <section className="pl-hs-scene pl-hs-card" style={{ animationDelay: '5.5s' }}>
          <Header eyebrow={t('verify.eyebrow')} title={t('verify.title')} sub={t('verify.sub')} chip="✓" chipLabel={t('verify.chipLabel')} />
          <div className="mt-4 space-y-2">
            {docs.map((d, i) => (
              <div
                key={d.label}
                className="pl-hs-row flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5"
                style={{ animationDelay: `${5.75 + i * 0.16}s` }}
              >
                <span className="pl-hs-tick grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px]" aria-hidden>✓</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-white">{d.label}</p>
                  <p className="truncate text-[10px] text-white/55">{d.meta}</p>
                </div>
              </div>
            ))}
          </div>
          <Footer note={t('verify.footnote')} badge={t('verify.badge')} />
        </section>

        {/* 3 — the documented trail after the deal closes */}
        <section className="pl-hs-scene pl-hs-card" style={{ animationDelay: '11s' }}>
          <Header eyebrow={t('track.eyebrow')} title={t('track.title')} sub={t('track.sub')} chip="11" chipLabel={t('track.chipLabel')} />
          <div className="mt-4 space-y-2">
            {steps.map((s, i) => (
              <div
                key={s.label}
                className="pl-hs-row flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5"
                style={{ animationDelay: `${11.25 + i * 0.16}s` }}
              >
                <span
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] ${
                    s.done ? 'pl-hs-tick' : 'bg-white/10 text-white/50'
                  }`}
                  aria-hidden
                >
                  {s.done ? '✓' : '•'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-white">{s.label}</p>
                  <p className="truncate text-[10px] text-white/55">{s.meta}</p>
                </div>
              </div>
            ))}
          </div>
          <Footer note={t('track.footnote')} badge={t('track.badge')} />
        </section>
      </div>

      {/* Which of the three is showing. Hidden when motion is reduced, since
          then all three are stacked and there is nothing to indicate. */}
      <div className="pl-hs-dots mt-3 flex items-center justify-center gap-1.5" aria-hidden>
        {scenes.map((label, i) => (
          <span key={label} className="pl-hs-dot" style={{ animationDelay: `${i * 5.5}s` }} />
        ))}
      </div>
    </div>
  );
}

function Header({ eyebrow, title, sub, chip, chipLabel }: { eyebrow: string; title: string; sub: string; chip: string; chipLabel: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="pl-hs-acc text-[10px] font-bold uppercase tracking-[.14em]">{eyebrow}</p>
        <p className="mt-1 truncate text-sm font-bold text-white">{title}</p>
        <p className="truncate text-xs text-white/60">{sub}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2 rounded-full bg-white/10 px-2.5 py-1">
        <span className="pl-hs-acc font-mono text-sm font-bold tabular-nums">{chip}</span>
        <span className="text-[10px] leading-tight text-white/70">{chipLabel}</span>
      </div>
    </div>
  );
}

function Footer({ note, badge }: { note: string; badge: string }) {
  return (
    <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/10 pt-3">
      <p className="truncate text-[11px] text-white/60">{note}</p>
      <span className="pl-hs-pill shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold">{badge}</span>
    </div>
  );
}
