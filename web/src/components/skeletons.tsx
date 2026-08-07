/**
 * Loading skeletons.
 *
 * A skeleton must MIRROR the shape of what replaces it. A generic spinner tells
 * the user "wait"; a skeleton tells them "a table of five rows is coming", and
 * the layout does not jump when it arrives. Anything else is a worse spinner.
 *
 * All of these are `aria-hidden` with a single visually-hidden live message —
 * a screen reader should hear "Loading" once, not read forty grey boxes.
 *
 * IMPORTANT: a `loading.tsx` may only be added to a segment that never calls
 * `notFound()`. The boundary commits a 200 shell before the 404 can be set,
 * which turns a genuine "not found" into a soft 404.
 */

function Bar({ w = '100%', h = 16 }: { w?: string; h?: number }) {
  return <div className="skeleton" style={{ width: w, height: h }} />;
}

export function LoadingAnnounce({ label = 'Loading' }: { label?: string }) {
  return (
    <span className="sr-only" role="status" aria-live="polite">
      {label}
    </span>
  );
}

/** Page header: title + subtitle + action button. */
export function SkeletonHeader() {
  return (
    <div className="mb-6 flex items-start justify-between gap-6" aria-hidden="true">
      <div className="flex-1 space-y-2.5">
        <Bar w="34%" h={26} />
        <Bar w="58%" h={14} />
      </div>
      <Bar w="128px" h={40} />
    </div>
  );
}

/** A row of stat tiles — matches the 4-up grid used across dashboards. */
export function SkeletonStats({ count = 4 }: { count?: number }) {
  return (
    <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-card border border-line bg-white p-5">
          <Bar w="52%" h={12} />
          <div className="mt-3">
            <Bar w="42%" h={28} />
          </div>
          <div className="mt-2">
            <Bar w="66%" h={11} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Table with a header band and evenly spaced rows. */
export function SkeletonTable({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-hidden rounded-card border border-line bg-white" aria-hidden="true">
      <div className="flex gap-4 border-b border-line bg-mist px-4 py-3">
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} className="flex-1">
            <Bar w="60%" h={10} />
          </div>
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 border-b border-line px-4 py-4 last:border-0">
          {Array.from({ length: cols }).map((_, c) => (
            <div key={c} className="flex-1">
              {/* Varying widths so the block reads as content, not a grid. */}
              <Bar w={c === 0 ? '78%' : `${45 + ((r + c) % 4) * 12}%`} h={13} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Card grid — catalogue and supplier listings. */
export function SkeletonCards({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-card border border-line bg-white p-5">
          <div className="flex items-center gap-3">
            <div className="skeleton h-10 w-10 shrink-0 rounded-control" />
            <div className="flex-1 space-y-2">
              <Bar w="70%" h={15} />
              <Bar w="45%" h={11} />
            </div>
          </div>
          <div className="mt-4 space-y-2">
            <Bar h={12} />
            <Bar w="82%" h={12} />
          </div>
          <div className="mt-4 flex gap-2">
            <Bar w="72px" h={22} />
            <Bar w="56px" h={22} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Chart panel — reserves the plot height so the page cannot jump. */
export function SkeletonChart({ height = 240 }: { height?: number }) {
  return (
    <div className="rounded-card border border-line bg-white" aria-hidden="true">
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <Bar w="30%" h={15} />
        <Bar w="20%" h={12} />
      </div>
      <div className="p-5">
        <div className="skeleton w-full" style={{ height }} />
      </div>
    </div>
  );
}

/** Filter rail beside the catalogue. */
export function SkeletonFilters({ sections = 6 }: { sections?: number }) {
  return (
    <div className="space-y-5" aria-hidden="true">
      {Array.from({ length: sections }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Bar w="48%" h={11} />
          {Array.from({ length: 3 }).map((_, j) => (
            <Bar key={j} w={`${62 + ((i + j) % 3) * 10}%`} h={13} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Detail page: header, key-value block, and a body panel. */
export function SkeletonDetail() {
  return (
    <div aria-hidden="true">
      <SkeletonHeader />
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-4">
          <SkeletonTable rows={4} cols={4} />
          <div className="rounded-card border border-line bg-white p-5 space-y-3">
            <Bar w="26%" h={14} />
            <Bar h={12} />
            <Bar w="88%" h={12} />
            <Bar w="72%" h={12} />
          </div>
        </div>
        <div className="rounded-card border border-line bg-white p-5 space-y-3">
          <Bar w="42%" h={14} />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex justify-between gap-3">
              <Bar w="46%" h={12} />
              <Bar w="28%" h={12} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Standard page wrapper so every loading.tsx is two lines. */
export function LoadingPage({ children, label }: { children: React.ReactNode; label?: string }) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <LoadingAnnounce label={label} />
      {children}
    </div>
  );
}
