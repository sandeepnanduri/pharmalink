'use client';

import { useState } from 'react';
import { resolveLogo } from '@/lib/logo';

/**
 * A company's mark.
 *
 * Falls back to the monogram on load failure as well as on absence — a licensed
 * logo service still 404s for the long tail of small manufacturers, and a broken
 * image icon in a supplier list looks like the platform is broken rather than
 * the logo being missing.
 *
 * The monogram is a first-class outcome, not a placeholder: deterministic hue
 * from the company name, so the same supplier is always the same colour and the
 * eye can learn it in a list.
 */

/**
 * Publishable key for the logo aggregator. Public by design — it identifies the
 * account for rate limiting, it does not authorise anything. With it unset the
 * aggregator rejects the request and every company falls back to its monogram,
 * which is a working state, not a broken one.
 */
const LOGO_TOKEN = process.env.NEXT_PUBLIC_LOGO_DEV_TOKEN;
export function CompanyLogo({
  name,
  website,
  logoUrl,
  size = 40,
  className = '',
}: {
  name: string;
  website?: string | null;
  logoUrl?: string | null;
  size?: number;
  className?: string;
}) {
  // 2× for high-DPI screens; resolveLogo caps the value it will actually request.
  const resolved = resolveLogo({ name, website, logoUrl }, { size: size * 2, token: LOGO_TOKEN });
  const [failed, setFailed] = useState(false);
  const showImage = resolved.kind === 'image' && !failed;

  return (
    <span
      className={`inline-grid shrink-0 place-items-center overflow-hidden rounded-control border border-line bg-white ${className}`}
      style={{ width: size, height: size }}
      data-testid="company-logo"
      data-kind={showImage ? 'image' : 'monogram'}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote logo host is not in the Next image allowlist by design; it is third-party and rate-limited.
        <img
          src={resolved.src}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          onError={() => setFailed(true)}
          className="h-full w-full object-contain p-1"
        />
      ) : (
        <span
          aria-hidden="true"
          className="font-display font-bold leading-none"
          style={{
            fontSize: size * 0.36,
            color: `hsl(${resolved.hue} 62% 32%)`,
            background: `hsl(${resolved.hue} 62% 94%)`,
            width: '100%',
            height: '100%',
            display: 'grid',
            placeItems: 'center',
          }}
        >
          {resolved.initials}
        </span>
      )}
    </span>
  );
}
