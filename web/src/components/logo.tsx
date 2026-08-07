import { Link } from '@/i18n/routing';

/**
 * The PharmaLink logo — the capsule mark (matching /icon.svg and the favicon)
 * plus an optional wordmark. Inline SVG so it is crisp at any size and needs no
 * network request.
 */
export function LogoMark({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} role="img" aria-label="PharmaLink" focusable="false">
      <defs>
        <linearGradient id="lm-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4F46E5" />
          <stop offset="1" stopColor="#06B6D4" />
        </linearGradient>
        <clipPath id="lm-cap">
          <rect x="146" y="196" width="220" height="120" rx="60" />
        </clipPath>
      </defs>
      <rect width="512" height="512" rx="116" fill="url(#lm-bg)" />
      <g transform="rotate(-45 256 256)">
        <g clipPath="url(#lm-cap)">
          <rect x="146" y="196" width="110" height="120" fill="#ffffff" />
          <rect x="256" y="196" width="110" height="120" fill="#CFFAFE" />
        </g>
        <line x1="256" y1="198" x2="256" y2="314" stroke="#0891B2" strokeWidth="8" strokeOpacity="0.45" />
      </g>
    </svg>
  );
}

/** Header lock-up: mark + "PharmaLink" wordmark, linked home. */
export function Logo() {
  return (
    <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="PharmaLink Global — home">
      <LogoMark className="h-8 w-8" />
      <span className="hidden font-display text-[15px] font-bold text-white sm:inline">
        Pharma<span className="text-accent">Link</span>
      </span>
    </Link>
  );
}
