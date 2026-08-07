import { LoadingAnnounce, SkeletonHeader, SkeletonStats, SkeletonTable } from '@/components/skeletons';

export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <LoadingAnnounce label="Loading your supplier workspace" />
      <SkeletonHeader />
      <SkeletonStats />
      <SkeletonTable rows={5} cols={7} />
    </div>
  );
}
