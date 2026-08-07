'use client';

import { ErrorState, useErrorReport } from '@/components/error-state';

export default function SegmentError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useErrorReport(error, 'suppliers');
  return (
    <ErrorState
      title="This supplier profile could not be loaded"
      body="The profile failed to load. Retrying usually resolves it."
      safeMessage="Nothing was changed."
      digest={error.digest}
      reset={reset}
    />
  );
}
