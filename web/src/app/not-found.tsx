/**
 * Root 404 — catches URLs that never matched a route, so there is no locale
 * segment and no translation context to read from. Copy is English-only here by
 * necessity; `[locale]/not-found.tsx` handles the localised case where a page
 * exists but the record does not.
 *
 * Uses `next/link` rather than the i18n `Link`: the routing helpers need a
 * locale this request never had, but plain Link only needs an href — and Next's
 * build lint rejects a raw <a> for an internal route.
 */
import Link from 'next/link';
export default function RootNotFound() {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#F4F8FB', color: '#12293D', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ maxWidth: 520, margin: '0 auto', padding: '96px 24px', textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: 44, fontWeight: 700, letterSpacing: '-.03em', color: '#0A8F7C' }}>404</p>
          <h1 style={{ margin: '14px 0 0', fontSize: 21, fontWeight: 700 }}>We could not find that page</h1>
          <p style={{ margin: '10px 0 0', fontSize: 15, lineHeight: 1.6, color: '#51677B' }}>
            The link may be out of date, or the record may belong to another organisation.
          </p>
          <div style={{ marginTop: 26, display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link
              href="/en/catalog"
              style={{
                padding: '11px 20px', borderRadius: 12, textDecoration: 'none', fontWeight: 600, fontSize: 15,
                background: 'linear-gradient(135deg,#12D6B4,#0FA3C4)', color: '#03271F',
              }}
            >
              Browse the catalogue
            </Link>
            <Link
              href="/en"
              style={{
                padding: '11px 20px', borderRadius: 12, textDecoration: 'none', fontWeight: 600, fontSize: 15,
                border: '1px solid #E3ECF3', color: '#12293D', background: '#fff',
              }}
            >
              Go home
            </Link>
          </div>
        </div>
      </body>
    </html>
  );
}
