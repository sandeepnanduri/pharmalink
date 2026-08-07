'use client';

import { ErrorState, useErrorReport } from '@/components/error-state';

export default function SegmentError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useErrorReport(error, 'buyer');
  return (
    <ErrorState
      title="Your requests could not be loaded"
      body="The connection timed out before your requests came back. Retrying usually resolves it."
      safeMessage="No request was created, changed or withdrawn."
      digest={error.digest}
      reset={reset}
    />
  );
}
