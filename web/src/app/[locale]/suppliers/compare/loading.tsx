import { LoadingAnnounce, SkeletonHeader, SkeletonTable } from '@/components/skeletons';

export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <LoadingAnnounce label="Loading the comparison" />
      <SkeletonHeader />
      <SkeletonTable rows={10} cols={4} />
    </div>
  );
}
