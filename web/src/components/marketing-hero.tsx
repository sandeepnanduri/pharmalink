import { Link } from '@/i18n/routing';
import { HexIcon } from './hex-icon';

/**
 * The public hero, built to the approved redesign (`redesign-kit/marketing`).
 *
 * Three things here are load-bearing rather than decorative:
 *
 *  - **It is dark.** The marketing pages alternate dark and light bands (hero →
 *    light content → dark CTA → dark footer). The rhythm is what makes the light
 *    sections read as content rather than as more page.
 *  - **The visual is the product, not a stock illustration.** It shows one RFQ
 *    with three comparable quotes and the certificates behind them, because
 *    "every quote comparable, every supplier document-checked" is the pitch. A
 *    generic hero image would say nothing a competitor could not also say.
 *  - **The search box is a real form.** It GETs the catalogue, so it works with
 *    no JavaScript and a crawler can follow it.
 *
 * Numbers that identify things (prices) are mono, per the design system.
 */

function Trust({ children, path }: { children: React.ReactNode; path: string }) {
  return (
    <span className="flex items-center gap-2.5 text-[13px] text-txt-inv2">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" className="flex-none" aria-hidden="true">
        <path d={path} stroke="#4FE8CC" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {children}
    </span>
  );
}

/** One quote line in the hero's RFQ card. */
function Quote({
  flag,
  name,
  meta,
  price,
  best,
  bestLabel,
  perKg,
}: {
  flag: string;
  name: string;
  meta: string;
  price: string;
  best?: boolean;
  bestLabel: string;
  perKg: string;
}) {
  return (
    <div
      data-testid="hero-quote"
      className={`relative mb-2.5 flex items-center gap-3 rounded-[13px] border p-3 ${
        best ? 'border-teal/55 bg-teal/[.08]' : 'border-[rgba(159,196,232,.14)] bg-white/[.03]'
      }`}
    >
      {best && (
        <span data-testid="hero-best" className="absolute -top-2 right-3 rounded-pill bg-teal px-2 py-0.5 text-[9px] font-bold tracking-wide text-ink">
          {bestLabel}
        </span>
      )}
      <span className="text-xl leading-none" aria-hidden="true">
        {flag}
      </span>
      <div className="min-w-0">
        <div className="text-[13.5px] font-semibold text-[#E7F2FB]">{name}</div>
        <div className="mt-0.5 text-[11.5px] text-[#8AA6BC]">{meta}</div>
      </div>
      <div className="ml-auto text-right">
        <div className="mono font-mono text-[14.5px] font-semibold text-white">{price}</div>
        <div className="text-[10.5px] text-[#8AA6BC]">{perKg}</div>
      </div>
    </div>
  );
}

export function MarketingHero({
  t,
  locale,
  supplierCount,
  countryCount,
}: {
  /** next-intl translator. Values are passed through, not string-replaced —
   *  calling t() on a message with placeholders and no values is a
   *  FORMATTING_ERROR, and ICU is what makes the zh copy able to reorder them. */
  t: (key: string, values?: Record<string, string | number>) => string;
  /** The form posts to a real URL, so it needs the locale spelled out — a
   *  hardcoded /en/catalog would send every Chinese visitor to the English
   *  catalogue, and the form has to work before any JS runs. */
  locale: string;
  supplierCount: string;
  countryCount: string;
}) {
  return (
    <header className="relative overflow-hidden bg-ink text-txt-inv">
      <div className="aurora a1 animate-drift absolute -right-40 -top-64 h-[720px] w-[720px] bg-[radial-gradient(circle,var(--glow-teal),transparent_65%)]" />
      <div className="aurora animate-drift absolute -bottom-56 -left-36 h-[560px] w-[560px] bg-[radial-gradient(circle,var(--glow-cyan),transparent_65%)]" />
      <div className="hexgrid" />

      <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 pb-20 pt-24 sm:px-6 lg:grid-cols-[1.05fr_.95fr] lg:gap-14 lg:pb-24 lg:pt-32">
        <div>
          <div data-testid="hero-pill"
            className="mb-6 inline-flex items-center gap-2.5 rounded-pill border border-teal/30 bg-teal/[.12] px-4 py-2 text-[13px] font-semibold text-[#8FEFD9]">
            <span className="animate-pulse-ring h-[7px] w-[7px] rounded-full bg-teal" />
            {t('heroPill', { suppliers: supplierCount, countries: countryCount })}
          </div>

          <h1 className="text-[clamp(38px,4.6vw,58px)] font-bold leading-[1.07] tracking-[-1.2px] text-white">
            {t('heroTitleA')}
            <br />
            <span className="grad-text">{t('heroTitleB')}</span>
          </h1>

          <p className="my-6 max-w-[540px] text-[17.5px] leading-[1.65] text-txt-inv2">{t('heroLede')}</p>

          {/* Real GET form — works without JS, and a crawler can follow it. */}
          <form
            action={`/${locale}/catalog`}
            method="get"
            className="flex max-w-[560px] items-center rounded-panel border border-[rgba(159,184,204,.28)] bg-white/[.06] py-1.5 pl-5 pr-1.5 backdrop-blur transition focus-within:border-teal focus-within:ring-4 focus-within:ring-teal/15"
          >
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" className="flex-none opacity-70" aria-hidden="true">
              <circle cx="11" cy="11" r="7" stroke="#7E97AB" strokeWidth="2" />
              <path d="M20 20l-3.5-3.5" stroke="#7E97AB" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              name="q"
              aria-label={t('heroSearchLabel')}
              placeholder={t('heroSearchPlaceholder')}
              className="min-w-0 flex-1 border-0 bg-transparent px-3.5 py-3 text-[15.5px] text-white outline-none placeholder:text-[#7E97AB]"
            />
            <button type="submit" className="btn bg-brand-gradient px-4 py-2 text-sm font-bold text-ink">
              {t('heroSearchCta')}
            </button>
          </form>

          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/signup" className="btn bg-brand-gradient px-5 py-3 text-[15px] font-bold text-ink shadow-glow">
              {t('heroCtaPrimary')}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M5 12h14m-6-6 6 6-6 6" stroke="#03271F" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
            <Link
              href="/catalog"
              className="btn border border-[rgba(159,184,204,.34)] bg-white/[.04] px-5 py-3 text-[15px] font-semibold text-white hover:bg-white/[.09]"
            >
              {t('heroCtaSecondary')}
            </Link>
          </div>

          <div className="mt-9 flex flex-wrap gap-6">
            <Trust path="M12 2l7 4v6c0 5-3 8-7 10-4-2-7-5-7-10V6l7-4zM9 12l2 2 4-4">{t('heroTrust1')}</Trust>
            <Trust path="M3 4h18v16H3zM3 9h18">{t('heroTrust2')}</Trust>
            <Trust path="M12 3a9 9 0 100 18 9 9 0 000-18zM12 7v5l3 3">{t('heroTrust3')}</Trust>
          </div>
        </div>

        {/* The product, shown rather than described. Decorative for assistive
            tech — every claim it makes is also stated in the copy above. */}
        <div className="relative min-h-[520px]" aria-hidden="true">
          <div className="glass animate-float absolute right-0 top-5 w-[min(430px,100%)] p-6">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-[13px] font-semibold tracking-[.4px] text-[#B9D2E6]">{t('heroRfqTitle')}</span>
              <span className="rounded-pill bg-teal/15 px-2.5 py-1 text-[10px] font-bold tracking-wide text-teal">
                {t('heroRfqTag')}
              </span>
            </div>
            <Quote flag="🇮🇳" name="Meridian Pharma Labs" meta="GMP · FDA · 12-day lead" price="$4.20" best bestLabel={t('heroBestValue')} perKg={t('heroPerKg')} />
            <Quote flag="🇨🇳" name="Hualing Bioscience" meta="GMP · EDQM · 18-day lead" price="$3.95" bestLabel={t('heroBestValue')} perKg={t('heroPerKg')} />
            <Quote flag="🇩🇪" name="Rheinwerk Chemie" meta="GMP · EU-WDA · 9-day lead" price="$5.10" bestLabel={t('heroBestValue')} perKg={t('heroPerKg')} />
          </div>

          <div className="glass animate-float absolute -bottom-2 left-0 w-[250px] p-[18px] [animation-delay:1.2s]">
            {[
              [t('heroDoc1'), t('heroDoc1Meta')],
              [t('heroDoc2'), t('heroDoc2Meta')],
              [t('heroDoc3'), t('heroDoc3Meta')],
            ].map(([name, meta]) => (
              <div key={name} data-testid="hero-doc" className="mb-2.5 flex items-center gap-2.5 last:mb-0">
                <HexIcon className="h-[30px] w-[30px] bg-teal/[.14]" size={15} stroke="#4FE8CC" />
                <div>
                  <div className="text-[12px] font-semibold text-[#DCEBF7]">{name}</div>
                  <div className="text-[10.5px] text-[#7E99AF]">{meta}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="glass animate-float absolute bottom-2 right-9 w-[210px] p-[18px] [animation-delay:.6s]">
            <div className="font-display text-[30px] font-bold text-white">
              58<span className="text-teal">%</span>
            </div>
            <div className="mt-1 text-[11.5px] leading-[1.5] text-[#8AA6BC]">{t('heroStat')}</div>
          </div>
        </div>
      </div>
    </header>
  );
}
