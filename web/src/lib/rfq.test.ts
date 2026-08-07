import { describe, it, expect } from 'vitest';
import {
  effectiveRfqStatus,
  canReceiveQuotes,
  canBeAwarded,
  canBeCancelled,
  isQuoteValid,
  isTerminalRfq,
  parseRfqStatus,
} from './rfq';

const NOW = new Date('2026-07-18T12:00:00Z');
const FUTURE = '2026-12-01T00:00:00Z';
const PAST = '2026-01-01T00:00:00Z';

describe('parseRfqStatus', () => {
  it('accepts known statuses and fails closed to open', () => {
    expect(parseRfqStatus('awarded')).toBe('awarded');
    expect(parseRfqStatus('accepted')).toBe('open'); // legacy value is not valid
    expect(parseRfqStatus(null)).toBe('open');
  });
});

describe('effectiveRfqStatus — derived expiry', () => {
  it('shows an open RFQ past its required-by date as expired', () => {
    expect(effectiveRfqStatus({ status: 'open', requiredBy: PAST }, NOW)).toBe('expired');
    expect(effectiveRfqStatus({ status: 'quoted', requiredBy: PAST }, NOW)).toBe('expired');
  });

  it('leaves a future-dated open/quoted RFQ as-is', () => {
    expect(effectiveRfqStatus({ status: 'open', requiredBy: FUTURE }, NOW)).toBe('open');
    expect(effectiveRfqStatus({ status: 'quoted', requiredBy: FUTURE }, NOW)).toBe('quoted');
  });

  it('never re-derives a terminal state — an awarded RFQ stays awarded even if old', () => {
    expect(effectiveRfqStatus({ status: 'awarded', requiredBy: PAST }, NOW)).toBe('awarded');
    expect(effectiveRfqStatus({ status: 'cancelled', requiredBy: PAST }, NOW)).toBe('cancelled');
    expect(isTerminalRfq('awarded')).toBe(true);
    expect(isTerminalRfq('cancelled')).toBe(true);
    expect(isTerminalRfq('open')).toBe(false);
  });
});

describe('canReceiveQuotes', () => {
  it('allows quoting on a live RFQ', () => {
    expect(canReceiveQuotes({ status: 'open', requiredBy: FUTURE }, NOW)).toBe(true);
    expect(canReceiveQuotes({ status: 'quoted', requiredBy: FUTURE }, NOW)).toBe(true);
  });

  it('blocks quoting on an expired RFQ (the required-by date has passed)', () => {
    expect(canReceiveQuotes({ status: 'open', requiredBy: PAST }, NOW)).toBe(false);
  });

  it('blocks quoting on an awarded or cancelled RFQ', () => {
    expect(canReceiveQuotes({ status: 'awarded', requiredBy: FUTURE }, NOW)).toBe(false);
    expect(canReceiveQuotes({ status: 'cancelled', requiredBy: FUTURE }, NOW)).toBe(false);
  });
});

describe('canBeAwarded', () => {
  it('allows awarding a live RFQ, once', () => {
    expect(canBeAwarded({ status: 'quoted', requiredBy: FUTURE }, NOW)).toBe(true);
  });
  it('blocks awarding an already-awarded RFQ (no double award)', () => {
    expect(canBeAwarded({ status: 'awarded', requiredBy: FUTURE }, NOW)).toBe(false);
  });
  it('blocks awarding an expired RFQ', () => {
    expect(canBeAwarded({ status: 'quoted', requiredBy: PAST }, NOW)).toBe(false);
  });
});

describe('canBeCancelled', () => {
  it('lets a buyer withdraw a live or expired RFQ', () => {
    expect(canBeCancelled({ status: 'open', requiredBy: FUTURE }, NOW)).toBe(true);
    expect(canBeCancelled({ status: 'open', requiredBy: PAST }, NOW)).toBe(true); // tidy up an expired one
  });
  it('cannot withdraw an already-awarded RFQ', () => {
    expect(canBeCancelled({ status: 'awarded', requiredBy: FUTURE }, NOW)).toBe(false);
  });
});

describe('isQuoteValid — the bug this whole file exists to prevent', () => {
  it('accepts a quote whose validity is in the future', () => {
    expect(isQuoteValid(FUTURE, NOW)).toBe(true);
  });

  it('REJECTS a quote that has already expired — no binding deal at a stale price', () => {
    expect(isQuoteValid(PAST, NOW)).toBe(false);
  });

  it('is valid through the whole of its last day, not just midnight', () => {
    // Valid "until 18 Jul": still usable at noon on the 18th.
    expect(isQuoteValid('2026-07-18T00:00:00Z', NOW)).toBe(true);
  });
});
