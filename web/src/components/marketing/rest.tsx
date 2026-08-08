import { Link } from '@/i18n/routing';

/**
 * The remaining sections of the approved design, in its own markup and classes
 * (rules in src/app/marketing.css, scoped under .mk).
 *
 * Where the mockup shows sample rows — listings, suppliers, news — these render
 * the database instead. That is the kit's own instruction: its demo interactions
 * "mark every point that needs a real API call". The design is the frame; the
 * content is this platform's.
 */

type T = (key: string, values?: Record<string, string | number>) => string;

const CHECK = 'M20 6L9 17l-5-5';

function Hex({ paths, stroke = '#0A8F7C', size = 20, lg = false }: { paths: string[]; stroke?: string; size?: number; lg?: boolean }) {
  return (
    <span className={`hex-bullet${lg ? ' hex-lg' : ''}`}>
      <svg width={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        {paths.map((d) => (
          <path key={d} d={d} stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        ))}
      </svg>
    </span>
  );
}

/** Live-looking marquee of recent marketplace events. */
export function Ticker({ items }: { items: { dot: string; text: string; strong: string }[] }) {
  // Duplicated once so the CSS marquee has something to scroll into.
  const run = [...items, ...items];
  return (
    // Decorative, and marked so. A marquee is hostile to a screen reader, and
    // every event in it is also in the sections below.
    <div className="ticker" data-testid="ticker" aria-hidden="true">
      <div className="in">
        {run.map((it, i) => (
          <span className="tk" key={`${it.strong}-${i}`}>
            <span className="d" style={{ background: it.dot }} />
            {it.text} — <b>{it.strong}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

export function Stats({ stats }: { stats: { value: string; label: string }[] }) {
  return (
    <div className="stats">
      <div className="wrap">
        <div className="in reveal">
          {stats.map((s) => (
            <div className="stat" key={s.label}>
              <div className="n">{s.value}</div>
              <div className="l">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** "From PO to plant gate — one documented trail" */
export function TrackSection({ t }: { t: T }) {
  const steps = [
    { k: 'tr1', state: 'done' },
    { k: 'tr2', state: 'done' },
    { k: 'tr3', state: 'done' },
    { k: 'tr4', state: 'cur' },
    { k: 'tr5', state: '' },
  ];
  return (
    <section className="track">
      <div className="wrap">
        <div className="sec-head center reveal">
          <div className="eyebrow" style={{ justifyContent: 'center' }}>{t('trEyebrow')}</div>
          <h2 className="sec">{t('trTitle')}</h2>
          <p className="sub">{t('trSub')}</p>
        </div>
        <div className="track-card reveal">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '26px' }}>
            <div>
              <span className="mono" style={{ fontSize: '12px', color: 'var(--txt-2)' }}>PO-2026-08-114</span>
              <h3 style={{ fontSize: '18px', marginTop: '4px' }}>{t('trOrder')}</h3>
            </div>
            <span className="tag tag-live" style={{ background: '#E5F9F3', color: '#0A8F7C' }}>{t('trStatus')}</span>
          </div>
          <div className="tl">
            {steps.map((s) => (
              <div className={`ts-step${s.state ? ' ' + s.state : ''}`} key={s.k}>
                <span className="nd">
                  {s.state === 'done' && (
                    <svg width="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d={CHECK} stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                <h6>{t(`${s.k}Title`)}</h6>
                <div className="d">{t(`${s.k}Meta`)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/** "Everything between 'we need it' and 'it cleared QA'" */
export function FeaturesSection({ t }: { t: T }) {
  const feats = [
    { k: 'f1', p: ['M12 2l7 4v6c0 5-3 8-7 10-4-2-7-5-7-10V6l7-4z', 'M9 12l2 2 4-4'] },
    { k: 'f2', p: ['M4 18V8m6 10V4m6 14v-7m4 7H2'] },
    { k: 'f3', p: ['M9 11l3 3 8-8', 'M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9'] },
    { k: 'f4', p: ['M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6', 'M17 3l2 2-2 2'] },
    { k: 'f5', p: ['M8 9l-4 3 4 3M16 9l4 3-4 3M13 5l-2 14'] },
    { k: 'f6', p: ['M4 19V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14l-4-2-4 2-4-2-4 2z', 'M8 8h8M8 12h5'] },
  ];
  return (
    <section>
      <div className="wrap">
        <div className="sec-head center reveal">
          <div className="eyebrow" style={{ justifyContent: 'center' }}>{t('ftEyebrow')}</div>
          <h2 className="sec">{t('ftTitle')}</h2>
        </div>
        <div className="feats">
          {feats.map((f) => (
            <div className="feat reveal" key={f.k}>
              <Hex paths={f.p} lg />
              <h4>{t(`${f.k}Title`)}</h4>
              <p>{t(`${f.k}Body`)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** "From registration to closed deal" — the dark five-step band. */
export function HowSection({ t }: { t: T }) {
  return (
    <section className="how" id="how">
      <div className="aurora a1" style={{ opacity: '.5' }} />
      <div className="wrap">
        <div className="sec-head center reveal">
          <div className="eyebrow" style={{ justifyContent: 'center' }}>{t('hwEyebrow')}</div>
          <h2 className="sec" style={{ margin: '0 auto' }}>{t('hwTitle')}</h2>
        </div>
        <div className="steps">
          {['01', '02', '03', '04', '05'].map((n, i) => (
            <div className="step reveal" key={n}>
              <div className="num">{n}</div>
              <h4>{t(`hw${i + 1}Title`)}</h4>
              <p>{t(`hw${i + 1}Body`)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Latest listings — real products, in the design's card. */
export function ListingsSection({
  t,
  listings,
}: {
  t: T;
  listings: { id: string; name: string; cas: string; segment: string; segmentKey: string; supplier: string; place: string; initial: string; hue: string; moq: string }[];
}) {
  return (
    <section className="listings">
      <div className="wrap">
        <div className="sec-head split reveal">
          <div>
            <div className="eyebrow">{t('lsEyebrow')}</div>
            <h2 className="sec">{t('lsTitle')}</h2>
          </div>
          <Link className="btn btn-dark btn-sm" href="/catalog">{t('lsCta')}</Link>
        </div>
        <div className="lgrid">
          {listings.map((p) => (
            <div className="listing reveal" key={p.id} data-testid="listing-card">
              <div className="top">
                <span className={`cat cat-${p.segmentKey}`}>{p.segment}</span>
                <span className="cas">CAS {p.cas}</span>
              </div>
              <h4>{p.name}</h4>
              <div className="sup">
                <span className="av" style={{ background: p.hue }}>{p.initial}</span>
                {p.supplier} · {p.place}
              </div>
              <div className="foot">
                <span className="pr">{p.moq}</span>
                <Link className="go" href={`/products/${p.id}`}>{t('lsRequest')} →</Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Verified suppliers — real organisations, in the design's card. */
export function SuppliersSection({
  t,
  suppliers,
}: {
  t: T;
  suppliers: { id: string; name: string; place: string; initial: string; hue: string; certs: string[]; products: number }[];
}) {
  return (
    <section>
      <div className="wrap">
        <div className="sec-head split reveal">
          <div>
            <div className="eyebrow">{t('spEyebrow')}</div>
            <h2 className="sec">{t('spTitle')}</h2>
          </div>
          <Link className="btn btn-dark btn-sm" href="/catalog">{t('spCta')}</Link>
        </div>
        <div className="sups">
          {suppliers.map((sup) => (
            <Link className="sup-card reveal" key={sup.id} href={`/suppliers/${sup.id}`} data-testid="supplier-card">
              <span className="av" style={{ background: sup.hue }}>{sup.initial}</span>
              <h4>{sup.name}</h4>
              <div className="loc">{sup.place}</div>
              <div className="certs">
                {sup.certs.map((c, i) => (
                  <span className={i === 0 ? 'badge gmp' : 'badge'} key={c}>{c}</span>
                ))}
              </div>
              <div className="loc">{t('spProducts', { n: sup.products })}</div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Pharma news — real posts, in the design's card. */
export function NewsSection({
  t,
  news,
}: {
  t: T;
  news: { id: string; title: string; source: string; tint: string; date: string; href: string }[];
}) {
  return (
    <section className="listings" style={{ paddingTop: 0, background: '#fff' }}>
      <div className="wrap">
        <div className="sec-head split reveal">
          <div>
            <div className="eyebrow">{t('nwEyebrow')}</div>
            <h2 className="sec">{t('nwTitle')}</h2>
          </div>
          <Link className="btn btn-dark btn-sm" href="/news">{t('nwCta')}</Link>
        </div>
        <div className="newsgrid">
          {news.map((n) => (
            <Link className="news reveal" key={n.id} href={n.href} data-testid="news-card">
              <span className="src" style={{ color: n.tint }}>● {n.source}</span>
              <h4>{n.title}</h4>
              <span className="dt">{n.date}</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Closing call to action + footer, both on the ink ground. */
export function CtaSection({ t }: { t: T }) {
  return (
    <section className="cta">
      <div className="aurora a1" />
      <div className="aurora a2" />
      <div className="hexgrid" />
      <div className="wrap">
        <div className="in reveal">
          <h2>
            {t('ctaTitleA')}
            <br />
            <span className="grad">{t('ctaTitleB')}</span>
          </h2>
          <p>{t('ctaBody')}</p>
          <div className="btns">
            <Link className="btn btn-primary" href="/signup">
              {t('ctaPrimary')}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M5 12h14m-6-6 6 6-6 6" stroke="#03271F" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
            <Link className="btn btn-ghost" href="/pricing">{t('ctaSecondary')}</Link>
          </div>
        </div>
      </div>
    </section>
  );
}

export function MarketingFooter({ t }: { t: T }) {
  const cols: { head: string; links: { label: string; href: string }[] }[] = [
    {
      head: t('foMarketplace'),
      links: [
        { label: t('foApis'), href: '/catalog?segment=api' },
        { label: t('foIntermediates'), href: '/catalog?segment=intermediate' },
        { label: t('foKsms'), href: '/catalog?segment=ksm' },
        { label: t('foExcipients'), href: '/catalog?segment=excipient' },
        { label: t('foRfq'), href: '/buyer/rfqs/new' },
      ],
    },
    {
      head: t('foPlatform'),
      links: [
        { label: t('foVerification'), href: '/verify' },
        { label: t('foPricing'), href: '/pricing' },
        { label: t('foDevelopers'), href: '/developers' },
        { label: t('foNews'), href: '/news' },
      ],
    },
    {
      head: t('foCompany'),
      links: [
        { label: t('foContent'), href: '/content' },
        { label: t('foTerms'), href: '/legal/terms' },
        { label: t('foPrivacy'), href: '/legal/privacy' },
      ],
    },
  ];
  return (
    <footer>
      <div className="wrap">
        <div className="fgrid">
          <div className="fbrand">
            <Link className="logo" href="/">
              <span className="hex-bullet">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d={CHECK} stroke="#03271F" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              Pharma<em>Link</em>
            </Link>
            <p>{t('foBlurb')}</p>
          </div>
          {cols.map((c) => (
            <div key={c.head}>
              <h6>{c.head}</h6>
              {c.links.map((l) => (
                <Link className="fl" key={l.label} href={l.href}>{l.label}</Link>
              ))}
            </div>
          ))}
        </div>
        <div className="wordmark">PharmaLink</div>
        <div className="fbot">
          <span>{t('foRights')}</span>
          <span style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <svg width="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 2l7 4v6c0 5-3 8-7 10-4-2-7-5-7-10V6l7-4z" stroke="#4FE8CC" strokeWidth="2" />
              <path d="M9 12l2 2 4-4" stroke="#4FE8CC" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {t('foTagline')}
          </span>
        </div>
      </div>
    </footer>
  );
}
