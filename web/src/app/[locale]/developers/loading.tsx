import { LoadingAnnounce, SkeletonDetail } from '@/components/skeletons';

export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <LoadingAnnounce label="Loading the API documentation" />
      <SkeletonDetail />
    </div>
  );
}
