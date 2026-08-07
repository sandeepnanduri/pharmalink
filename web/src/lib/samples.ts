/**
 * Sample-request lifecycle — pure + unit tested. A buyer requests a product
 * sample; the seller approves → ships, or declines. No payment is involved.
 */

export const SAMPLE_STATUSES = ['requested', 'approved', 'shipped', 'declined'] as const;
export type SampleStatus = (typeof SAMPLE_STATUSES)[number];

/** Statuses the SELLER may move a request to from `current`. */
export function nextSellerSampleStatuses(current: string): SampleStatus[] {
  switch (current) {
    case 'requested':
      return ['approved', 'declined'];
    case 'approved':
      return ['shipped'];
    default:
      return []; // shipped / declined are terminal
  }
}

export function canSellerSetSample(current: string, next: string): boolean {
  return nextSellerSampleStatuses(current).includes(next as SampleStatus);
}

export function isTerminalSample(status: string): boolean {
  return status === 'shipped' || status === 'declined';
}
