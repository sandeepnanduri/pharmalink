import { LoadingAnnounce, SkeletonCards, SkeletonFilters } from '@/components/skeletons';

export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <LoadingAnnounce label="Loading the catalogue" />
      <div className="grid gap-6 lg:grid-cols-[248px_1fr]">
        <aside className="hidden lg:block"><SkeletonFilters sections={7} /></aside>
        <div>
          <div className="mb-4 h-9 w-full skeleton" />
          <SkeletonCards count={6} />
        </div>
      </div>
    </div>
  );
}
