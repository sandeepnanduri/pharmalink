import { LoadingAnnounce, SkeletonHeader, SkeletonStats, SkeletonTable } from '@/components/skeletons';

export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <LoadingAnnounce label="Loading price intelligence" />
      <SkeletonHeader />
      <SkeletonStats />
      <SkeletonTable rows={7} cols={7} />
    </div>
  );
}
