'use client';

import { useErrorReport } from '@/components/error-state';

/**
 * The outermost boundary. It replaces the ENTIRE document — including the root
 * layout — so it must be self-contained: no fonts, no providers, no translation
 * context, because whatever broke may be exactly those.
 *
 * Styling is inline for the same reason: if the stylesheet failed to load, a
 * class-based layout renders as unstyled text on white.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useErrorReport(error, 'global');

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#F4F8FB', color: '#12293D' }}>
        <div style={{ maxWidth: 520, margin: '0 auto', padding: '96px 24px', textAlign: 'center' }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>PharmaLink could not load</h1>
          <p style={{ marginTop: 12, fontSize: 15, lineHeight: 1.6, color: '#51677B' }}>
            Something failed before the page could start. Your data has not been changed.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 24, padding: '11px 20px', borderRadius: 12, border: 0, cursor: 'pointer',
              background: 'linear-gradient(135deg,#12D6B4,#0FA3C4)', color: '#03271F', fontWeight: 600, fontSize: 15,
            }}
          >
            Try again
          </button>
          {error.digest && (
            <p style={{ marginTop: 32, fontSize: 11, color: '#7E93A6' }}>
              Reference <span style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 700 }}>{error.digest}</span>
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
