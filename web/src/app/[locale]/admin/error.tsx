'use client';

import { ErrorState, useErrorReport } from '@/components/error-state';

export default function SegmentError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useErrorReport(error, 'admin');
  return (
    <ErrorState
      title="The operations console could not be loaded"
      body="This screen failed to load its queue. Retrying usually resolves it."
      safeMessage="No verification decision was recorded."
      digest={error.digest}
      reset={reset}
    />
  );
}
