/**
 * The brand motif: a hexagon — the benzene ring — holding a checkmark.
 *
 * Per the redesign system this is the shape for icon containers, avatars and
 * bullets. Circles and rounded squares are deliberately not used in those roles,
 * so the mark reads as chemistry rather than as a generic app.
 *
 * Decorative by default: it repeats a claim the adjacent text already makes, so
 * announcing it would just make a screen reader say "image" between every line.
 */
export function HexIcon({
  className = '',
  size = 16,
  stroke = '#03271F',
  path = 'M20 6L9 17l-5-5',
}: {
  className?: string;
  /** Glyph size in px; the hexagon sizes from the className. */
  size?: number;
  stroke?: string;
  path?: string;
}) {
  return (
    <span className={`hex grid flex-none place-items-center ${className}`} aria-hidden="true">
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path d={path} stroke={stroke} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
