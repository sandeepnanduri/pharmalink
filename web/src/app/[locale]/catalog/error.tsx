'use client';

import { ErrorState, useErrorReport } from '@/components/error-state';

export default function SegmentError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useErrorReport(error, 'catalog');
  return (
    <ErrorState
      title="The catalogue could not be loaded"
      body="The search could not complete. Try again, or clear your filters if this keeps happening."
      safeMessage="Nothing was changed."
      digest={error.digest}
      reset={reset}
    />
  );
}
