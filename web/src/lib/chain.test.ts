import { describe, it, expect } from 'vitest';
import { GENESIS_HASH, hashEntry, hashPayload, verifyChain, type ChainEntryInput } from './chain';

function buildChain(actions: string[]): ChainEntryInput[] {
  const entries: ChainEntryInput[] = [];
  let prevHash = GENESIS_HASH;
  actions.forEach((action, i) => {
    const seq = i + 1;
    const dataHash = hashPayload({ action, i });
    const hash = hashEntry(seq, 'Rfq', 'rfq_1', action, dataHash, prevHash);
    entries.push({ seq, entity: 'Rfq', entityId: 'rfq_1', action, dataHash, prevHash, hash });
    prevHash = hash;
  });
  return entries;
}

describe('hashPayload / hashEntry', () => {
  it('is deterministic — same input always produces the same hash', () => {
    expect(hashPayload({ a: 1 })).toBe(hashPayload({ a: 1 }));
    expect(hashEntry(1, 'Rfq', 'r1', 'posted', 'd'.repeat(64), GENESIS_HASH)).toBe(
      hashEntry(1, 'Rfq', 'r1', 'posted', 'd'.repeat(64), GENESIS_HASH)
    );
  });

  it('changes when any input changes', () => {
    const base = hashEntry(1, 'Rfq', 'r1', 'posted', 'd'.repeat(64), GENESIS_HASH);
    expect(hashEntry(2, 'Rfq', 'r1', 'posted', 'd'.repeat(64), GENESIS_HASH)).not.toBe(base);
    expect(hashEntry(1, 'Rfq', 'r2', 'posted', 'd'.repeat(64), GENESIS_HASH)).not.toBe(base);
    expect(hashEntry(1, 'Rfq', 'r1', 'awarded', 'd'.repeat(64), GENESIS_HASH)).not.toBe(base);
  });
});

describe('verifyChain', () => {
  it('validates a correctly-built chain', () => {
    const entries = buildChain(['posted', 'introduced', 'awarded']);
    expect(verifyChain(entries)).toEqual({ valid: true, brokenAtSeq: null });
  });

  it('validates an empty chain', () => {
    expect(verifyChain([])).toEqual({ valid: true, brokenAtSeq: null });
  });

  it('catches a tampered dataHash — downstream hashes no longer match', () => {
    const entries = buildChain(['posted', 'introduced', 'awarded']);
    entries[1].dataHash = 'f'.repeat(64); // tamper with the middle entry's content
    const result = verifyChain(entries);
    expect(result.valid).toBe(false);
    expect(result.brokenAtSeq).toBe(2); // the tampered entry itself no longer hashes correctly
  });

  it('catches a tampered stored hash directly', () => {
    const entries = buildChain(['posted', 'introduced', 'awarded']);
    entries[0].hash = 'f'.repeat(64);
    const result = verifyChain(entries);
    expect(result.valid).toBe(false);
    // The first entry's own hash is wrong AND every later prevHash link breaks —
    // detection fires at the first entry whose linkage or hash disagrees.
    expect(result.brokenAtSeq).toBe(1);
  });

  it('catches a broken prevHash link (e.g. a deleted middle entry)', () => {
    const entries = buildChain(['posted', 'introduced', 'awarded']);
    const withGap = [entries[0], entries[2]]; // entries[2].prevHash still points at the deleted entries[1]
    const result = verifyChain(withGap);
    expect(result.valid).toBe(false);
    expect(result.brokenAtSeq).toBe(entries[2].seq);
  });
});
