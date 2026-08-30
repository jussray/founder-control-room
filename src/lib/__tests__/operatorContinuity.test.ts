import { describe, expect, it } from 'vitest';
import {
  createOperatorContinuityReceipt,
  operatorContinuityFingerprint,
  validateOperatorContinuityReceipt,
  type OperatorContinuityInput,
} from '../operatorContinuity.js';

const baseInput: OperatorContinuityInput = {
  source: 'chatgpt',
  projectSlug: 'founder-control-room',
  repositoryFullName: 'jussray/founder-control-room',
  observedSha: 'a'.repeat(40),
  evidenceRefs: ['github:main-readback', 'github:pr-733'],
  observedAt: '2026-08-30T04:40:00.000Z',
  expiresAt: '2026-08-30T04:55:00.000Z',
  predecessorFingerprint: 'b'.repeat(64),
  runtimeVerified: false,
};

describe('operator continuity contract', () => {
  it.each(['chatgpt', 'base44', 'manus'] as const)(
    'binds %s evidence without granting authority',
    (source) => {
      const receipt = createOperatorContinuityReceipt({ ...baseInput, source });
      expect(receipt).toMatchObject({
        source,
        browserCookie: false,
        authorizing: false,
        standingMergeAuthority: false,
        approvalCarryForward: false,
        founderDecisionRequired: true,
      });
      expect(receipt.fingerprint).toMatch(/^[0-9a-f]{64}$/);
      expect(validateOperatorContinuityReceipt(receipt)).toEqual([]);
    },
  );

  it('normalizes evidence ordering so equivalent observations keep one fingerprint', () => {
    const first = operatorContinuityFingerprint(baseInput);
    const second = operatorContinuityFingerprint({
      ...baseInput,
      evidenceRefs: ['github:pr-733', 'github:main-readback', 'github:pr-733'],
    });
    expect(second).toBe(first);
  });

  it('changes the fingerprint when exact source truth moves', () => {
    const original = operatorContinuityFingerprint(baseInput);
    const moved = operatorContinuityFingerprint({ ...baseInput, observedSha: 'c'.repeat(40) });
    expect(moved).not.toBe(original);
  });

  it('rejects an expired-at-observation receipt instead of treating stale continuity as truth', () => {
    expect(() => createOperatorContinuityReceipt({
      ...baseInput,
      expiresAt: baseInput.observedAt,
    })).toThrow(/expiresAt must be later than observedAt/);
  });

  it('detects a forged authority flag on otherwise valid evidence', () => {
    const receipt = createOperatorContinuityReceipt(baseInput);
    const forged = { ...receipt, authorizing: true } as unknown as typeof receipt;
    expect(validateOperatorContinuityReceipt(forged)).toContain('operator continuity cannot authorize actions');
  });

  it('keeps runtime proof descriptive even when separately verified', () => {
    const receipt = createOperatorContinuityReceipt({ ...baseInput, runtimeVerified: true });
    expect(receipt.runtimeVerified).toBe(true);
    expect(receipt.authorizing).toBe(false);
    expect(receipt.founderDecisionRequired).toBe(true);
  });
});
