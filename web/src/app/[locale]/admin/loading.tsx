import { LoadingAnnounce, SkeletonHeader, SkeletonStats, SkeletonTable } from '@/components/skeletons';

export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <LoadingAnnounce label="Loading the operations queue" />
      <SkeletonHeader />
      <SkeletonStats />
      <SkeletonTable rows={6} cols={7} />
    </div>
  );
}
