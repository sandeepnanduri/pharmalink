import { LoadingAnnounce, SkeletonHeader, SkeletonTable } from '@/components/skeletons';

export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <LoadingAnnounce label="Loading notifications" />
      <SkeletonHeader />
      <SkeletonTable rows={6} cols={3} />
    </div>
  );
}
