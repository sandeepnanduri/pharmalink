'use client';

import { useState } from 'react';

/**
 * The RFQ comparison card from the approved design.
 *
 * In the mockup this is built by innerHTML from an `RFQ` object and three tab
 * buttons. Here it is state — same data, same markup, same classes, but React
 * owns the DOM and the strings are escaped rather than concatenated.
 *
 * The figures are illustrative, exactly as in the design: this card is a picture
 * of the product on a marketing page, not a live quote board. Everything below
 * the fold that *looks* like platform data (listings, suppliers, news) is read
 * from the database instead — the rule is that nothing is presented as a real
 * record unless it is one.
 */

interface Row {
  flag: string;
  name: string;
  certs: string[];
  price: string;
  lead: string;
  moq: string;
  best?: boolean;
}

const PRODUCTS: { label: string; cas: string; rows: Row[] }[] = [
  {
    label: 'Paracetamol',
    cas: 'CAS 103-90-2 · 500 kg',
    rows: [
      { flag: '🇮🇳', name: 'Meridian Pharma Labs', certs: ['FDA GMP', 'WHO-GMP'], price: '$4.20', lead: '12 days', moq: '100 kg', best: true },
      { flag: '🇨🇳', name: 'Hualing Bioscience', certs: ['EDQM CEP', 'GMP'], price: '$3.95', lead: '18 days', moq: '250 kg' },
      { flag: '🇩🇪', name: 'Rheinwerk Chemie', certs: ['EU-GMP', 'EU-WDA'], price: '$5.10', lead: '9 days', moq: '50 kg' },
    ],
  },
  {
    label: 'Ibuprofen',
    cas: 'CAS 15687-27-1 · 1,000 kg',
    rows: [
      { flag: '🇨🇳', name: 'Hualing Bioscience', certs: ['EDQM CEP', 'GMP'], price: '$6.85', lead: '16 days', moq: '250 kg', best: true },
      { flag: '🇮🇳', name: 'Sunrise Actives', certs: ['WHO-GMP'], price: '$6.60', lead: '24 days', moq: '500 kg' },
      { flag: '🇩🇪', name: 'Rheinwerk Chemie', certs: ['EU-GMP'], price: '$8.20', lead: '10 days', moq: '100 kg' },
    ],
  },
  {
    label: 'Metformin HCl',
    cas: 'CAS 657-24-9 · 2,000 kg',
    rows: [
      { flag: '🇮🇳', name: 'Sunrise Actives', certs: ['WHO-GMP', 'ISO 9001'], price: '$3.05', lead: '14 days', moq: '1,000 kg', best: true },
      { flag: '🇮🇳', name: 'Aarav Fine Chem', certs: ['WHO-GMP'], price: '$3.18', lead: '11 days', moq: '500 kg' },
      { flag: '🇨🇳', name: 'Hualing Bioscience', certs: ['EDQM CEP'], price: '$2.95', lead: '21 days', moq: '2,000 kg' },
    ],
  },
];

export function RfqCompare({
  labels,
}: {
  labels: { unitPrice: string; leadMoq: string; accept: string; compare: string; foot: string; landed: string; bestValue: string };
}) {
  const [active, setActive] = useState(0);
  const product = PRODUCTS[active];

  return (
    <div className="rfq-card reveal">
      <div className="head">
        <div className="rfq-tabs" role="tablist">
          {PRODUCTS.map((p, i) => (
            <button
              key={p.label}
              type="button"
              role="tab"
              aria-selected={i === active}
              className={`rfq-tab${i === active ? ' on' : ''}`}
              onClick={() => setActive(i)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <span className="cas">{product.cas}</span>
      </div>

      <div className="rfq-body">
        {product.rows.map((r) => (
          <div key={r.name + r.price} className={`quote${r.best ? ' best' : ''}`}>
            {r.best && <span className="best-flag">{labels.bestValue}</span>}
            <span className="flag">{r.flag}</span>
            <div>
              <div className="nm">{r.name}</div>
              <div className="cert">
                {r.certs.map((c) => (
                  <span key={c} className={`badge${c.includes('GMP') || c.includes('CEP') ? ' gmp' : ''}`}>
                    {c}
                  </span>
                ))}
              </div>
            </div>
            <div className="kv">
              <div className="k">{labels.unitPrice}</div>
              <div className="v">
                {r.price}
                <span style={{ fontSize: '10px', color: 'var(--txt-2)' }}>/kg</span>
              </div>
            </div>
            <div className="kv">
              <div className="k">{labels.leadMoq}</div>
              <div className="v" style={{ fontSize: '12.5px' }}>
                {r.lead} · {r.moq}
              </div>
            </div>
            <button type="button" className="sel">
              {r.best ? labels.accept : labels.compare}
            </button>
          </div>
        ))}
        <div className="rfq-foot">
          <span>{labels.foot}</span>
          <span className="lc">{labels.landed} →</span>
        </div>
      </div>
    </div>
  );
}
