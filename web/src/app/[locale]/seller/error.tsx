'use client';

import { ErrorState, useErrorReport } from '@/components/error-state';

export default function SegmentError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useErrorReport(error, 'seller');
  return (
    <ErrorState
      title="Your supplier workspace could not be loaded"
      body="We could not reach your listings and inquiries just now. Retrying usually resolves it."
      safeMessage="No quote was submitted and no listing was changed."
      digest={error.digest}
      reset={reset}
    />
  );
}
