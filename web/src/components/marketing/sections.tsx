import { HexIcon } from '../hex-icon';
import { RfqCompare } from './rfq-compare';

/**
 * Marketing sections, ported from the approved design (`pharmalink_redesign.html`).
 *
 * The class names are the design's own and the rules live in `src/app/marketing.css`,
 * scoped under `.mk`. That is deliberate: keeping the port's structure identical to
 * the source is what lets the next revision of the mockup be diffed against it
 * instead of re-interpreted.
 *
 * All copy goes through `t` — the design is bilingual by requirement (the kit's own
 * rule 5), and the mockup's own nav shows the EN · 简体中文 switch.
 */

type T = (key: string) => string;

/** A hexagon bullet with a stroked glyph, per the brand motif. */
function Bullet({ d, stroke = '#0A8F7C', size = 16 }: { d: string; stroke?: string; size?: number }) {
  return (
    <span className="hex-bullet">
      <svg width={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        {d.split('|').map((path) => (
          <path key={path} d={path} stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        ))}
      </svg>
    </span>
  );
}

/** "One RFQ. Every qualified supplier. Side by side." */
export function MarketplaceSection({ t }: { t: T }) {
  const points = [
    { k: 'mp1', d: 'M20 6L9 17l-5-5' },
    { k: 'mp2', d: 'M12 2l7 4v6c0 5-3 8-7 10-4-2-7-5-7-10V6l7-4z' },
    { k: 'mp3', d: 'M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6' },
  ];
  return (
    <section id="marketplace">
      <div className="wrap">
        <div className="rfq">
          <div className="reveal">
            <div className="eyebrow">{t('mpEyebrow')}</div>
            <h2 className="sec">{t('mpTitle')}</h2>
            <div className="check-list">
              {points.map((p) => (
                <div className="c" key={p.k}>
                  <Bullet d={p.d} />
                  <div>
                    <h4>{t(`${p.k}Title`)}</h4>
                    <p>{t(`${p.k}Body`)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <RfqCompare
            labels={{
              unitPrice: t('mpUnitPrice'),
              leadMoq: t('mpLeadMoq'),
              accept: t('mpAccept'),
              compare: t('mpCompare'),
              foot: t('mpFoot'),
              landed: t('mpLanded'),
              bestValue: t('mpBestValue'),
            }}
          />
        </div>
      </div>
    </section>
  );
}

/** "Checked by our team. Not self-declared." — the dark trust band. */
export function VerifySection({ t }: { t: T }) {
  const points = [
    { k: 'vp1', d: 'M12 2l7 4v6c0 5-3 8-7 10-4-2-7-5-7-10V6l7-4z|M9 12l2 2 4-4' },
    { k: 'vp2', d: 'M12 7v5l3 3' },
    { k: 'vp3', d: 'M4 6h16M4 12h16M4 18h10' },
  ];
  const docs = [
    { k: 'd1', tint: 'rgba(15,191,164,.13)', stroke: '#4FE8CC', chip: 'verified', d: 'M12 2l7 4v6c0 5-3 8-7 10-4-2-7-5-7-10V6l7-4z|M9 12l2 2 4-4' },
    { k: 'd2', tint: 'rgba(65,183,240,.13)', stroke: '#41B7F0', chip: 'verified', d: 'M8 8h8M8 12h8M8 16h5' },
    { k: 'd3', tint: 'rgba(139,124,246,.14)', stroke: '#8B7CF6', chip: 'onFile', d: 'M9 3h6l4 4v14H5V3h4z|M9 13l2 2 4-4' },
    { k: 'd4', tint: 'rgba(242,179,61,.13)', stroke: '#F2B33D', chip: 'recheck', d: 'M12 8v5' },
  ];
  return (
    <section className="verify" id="verify">
      <div className="aurora a2" style={{ opacity: '.6' }} />
      <div className="wrap">
        <div className="vgrid">
          <div className="reveal">
            <div className="eyebrow">{t('vEyebrow')}</div>
            <h2 className="sec">
              {t('vTitleA')}
              <br />
              {t('vTitleB')}
            </h2>
            <p className="sub">{t('vSub')}</p>
            <div className="vpoints">
              {points.map((p) => (
                <div className="vp" key={p.k}>
                  <Bullet d={p.d} stroke="#4FE8CC" />
                  <div>
                    <h4>{t(`${p.k}Title`)}</h4>
                    <p>{t(`${p.k}Body`)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="doc-stack reveal">
            {docs.map((doc) => (
              <div className="doc" key={doc.k}>
                <span className="ic" style={{ background: doc.tint }}>
                  <svg width="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    {doc.d.split('|').map((path) => (
                      <path key={path} d={path} stroke={doc.stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    ))}
                  </svg>
                </span>
                <div>
                  <h5>{t(`${doc.k}Name`)}</h5>
                  <div className="m">{t(`${doc.k}Meta`)}</div>
                </div>
                <div className="st">
                  <span
                    className="chip"
                    style={
                      doc.chip === 'recheck'
                        ? { color: '#F2B33D', background: 'rgba(242,179,61,.12)', borderColor: 'rgba(242,179,61,.35)' }
                        : undefined
                    }
                  >
                    {t(`vChip_${doc.chip}`)}
                  </span>
                  <span className="ts">{t(`${doc.k}Ts`)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export { HexIcon };
