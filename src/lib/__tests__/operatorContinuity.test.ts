import { describe, expect, it } from 'vitest';
import {
  createOperatorContinuityReceipt,
  createOperatorContinuityReceiptV2,
  evaluateOperatorContinuityReceiptV2,
  operatorContinuityDimensionFingerprint,
  operatorContinuityFingerprint,
  operatorContinuityFingerprintV2,
  validateOperatorContinuityReceipt,
  validateOperatorContinuityReceiptV2,
  type OperatorContinuityInput,
  type OperatorContinuityInputV2,
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

const NOW = '2026-08-31T16:30:00.000Z';
const baseInputV2: OperatorContinuityInputV2 = {
  source: 'chatgpt',
  projectSlug: 'founder-control-room',
  repositoryFullName: 'jussray/founder-control-room',
  targetBranch: 'main',
  targetSha: 'a'.repeat(40),
  prNumber: 733,
  baseSha: 'b'.repeat(40),
  headSha: 'c'.repeat(40),
  scopeFingerprint: '1'.repeat(64),
  proofFingerprint: '2'.repeat(64),
  reviewFingerprint: '3'.repeat(64),
  providerFingerprint: '4'.repeat(64),
  runtimeFingerprint: '5'.repeat(64),
  authorityFingerprint: '6'.repeat(64),
  evidenceRefs: ['github:main-readback', 'github:pr-733'],
  observedAt: '2026-08-31T16:20:00.000Z',
  expiresAt: '2026-08-31T16:40:00.000Z',
  predecessorFingerprint: null,
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

describe('operator continuity v2 fingerprint + cookie', () => {
  it('uses the cross-repo canonical v2 test vector', () => {
    expect(operatorContinuityFingerprintV2(baseInputV2)).toBe(
      'ee90f5351755772ed04169c63abb3347eba7b9ec721b706d0002f7fa0d32f3d9',
    );
  });

  it('hashes provider observations so retry attempt/job/state movement is load-bearing', () => {
    expect(operatorContinuityDimensionFingerprint({
      provider: 'cloudflare',
      audit: 'authority',
      attempt: 2,
      jobId: '99560046321',
      state: 'queued',
      mutation: 'none',
    })).toBe('1a5507cb4afcde7281176b78d05e9b788a6f278672c1f196b1c0eb2f1d55171a');
  });

  it('creates a valid non-authorizing v2 receipt for Work/Chief/Codex handoffs', () => {
    for (const source of ['work', 'chief', 'codex'] as const) {
      const receipt = createOperatorContinuityReceiptV2({ ...baseInputV2, source });
      expect(validateOperatorContinuityReceiptV2(receipt)).toEqual([]);
      expect(receipt).toMatchObject({
        source,
        browserCookie: false,
        authorizing: false,
        standingMergeAuthority: false,
        approvalCarryForward: false,
        founderDecisionRequired: true,
      });
    }
  });

  it('allows a fresh reread when load-bearing state is unchanged even if observation time rotates', () => {
    const receipt = createOperatorContinuityReceiptV2(baseInputV2);
    const result = evaluateOperatorContinuityReceiptV2(receipt, {
      ...baseInputV2,
      observedAt: '2026-08-31T16:29:00.000Z',
      expiresAt: '2026-08-31T16:49:00.000Z',
    }, NOW);
    expect(result).toEqual({
      state: 'current',
      reasons: [],
      reacquireRequired: false,
      continuityMayAuthorizeAction: false,
    });
  });

  it('invalidates inherited green whenever any load-bearing dimension moves', () => {
    const receipt = createOperatorContinuityReceiptV2(baseInputV2);
    const variants: Array<[Partial<OperatorContinuityInputV2>, string]> = [
      [{ source: 'work' }, 'source_moved'],
      [{ projectSlug: 'sekret-bip' }, 'project_moved'],
      [{ repositoryFullName: 'jussray/other' }, 'repository_moved'],
      [{ targetBranch: 'release' }, 'target_branch_moved'],
      [{ targetSha: 'd'.repeat(40) }, 'target_sha_moved'],
      [{ prNumber: 999 }, 'pr_moved'],
      [{ baseSha: 'd'.repeat(40) }, 'base_sha_moved'],
      [{ headSha: 'e'.repeat(40) }, 'head_sha_moved'],
      [{ scopeFingerprint: '7'.repeat(64) }, 'scope_moved'],
      [{ proofFingerprint: '8'.repeat(64) }, 'proof_moved'],
      [{ reviewFingerprint: '9'.repeat(64) }, 'review_moved'],
      [{ providerFingerprint: 'a'.repeat(64) }, 'provider_moved'],
      [{ runtimeFingerprint: 'b'.repeat(64) }, 'runtime_moved'],
      [{ authorityFingerprint: 'c'.repeat(64) }, 'authority_moved'],
      [{ evidenceRefs: ['github:main-readback', 'cloudflare:job:99560046321'] }, 'evidence_refs_moved'],
    ];

    for (const [change, reason] of variants) {
      const result = evaluateOperatorContinuityReceiptV2(receipt, { ...baseInputV2, ...change }, NOW);
      expect(result.state, reason).toBe('stale');
      expect(result.reasons, reason).toContain(reason);
      expect(result.reacquireRequired, reason).toBe(true);
      expect(result.continuityMayAuthorizeAction, reason).toBe(false);
    }
  });

  it('classifies the Se’kret Bip Cloudflare rerun as a new cookie even when main is unchanged', () => {
    const attempt1Provider = operatorContinuityDimensionFingerprint({
      provider: 'cloudflare', audit: 'authority', attempt: 1, state: 'blocked', mutation: 'none',
    });
    const attempt2Provider = operatorContinuityDimensionFingerprint({
      provider: 'cloudflare', audit: 'authority', attempt: 2, jobId: '99560046321', state: 'queued', mutation: 'none',
    });
    const receipt = createOperatorContinuityReceiptV2({
      ...baseInputV2,
      projectSlug: 'sekret-bip',
      repositoryFullName: 'jussray/Sekret-Bip',
      targetSha: '0d26db9c77799bd99ba68db194bd6bd948ca4f37',
      prNumber: null,
      baseSha: null,
      headSha: null,
      providerFingerprint: attempt1Provider,
      evidenceRefs: ['cloudflare:authority-audit:attempt-1'],
    });
    const result = evaluateOperatorContinuityReceiptV2(receipt, {
      ...baseInputV2,
      projectSlug: 'sekret-bip',
      repositoryFullName: 'jussray/Sekret-Bip',
      targetSha: '0d26db9c77799bd99ba68db194bd6bd948ca4f37',
      prNumber: null,
      baseSha: null,
      headSha: null,
      providerFingerprint: attempt2Provider,
      evidenceRefs: ['cloudflare:authority-audit:attempt-2', 'cloudflare:job:99560046321'],
    }, NOW);
    expect(result.state).toBe('stale');
    expect(result.reasons).toEqual(expect.arrayContaining(['provider_moved', 'evidence_refs_moved']));
  });

  it('treats unknown provider/runtime evidence becoming observed as continuity movement', () => {
    const receipt = createOperatorContinuityReceiptV2({
      ...baseInputV2,
      providerFingerprint: null,
      runtimeFingerprint: null,
    });
    const result = evaluateOperatorContinuityReceiptV2(receipt, baseInputV2, NOW);
    expect(result.state).toBe('stale');
    expect(result.reasons).toEqual(expect.arrayContaining(['provider_moved', 'runtime_moved']));
  });

  it('expires without granting authority and fails closed on forged receipt fields', () => {
    const receipt = createOperatorContinuityReceiptV2(baseInputV2);
    const expired = evaluateOperatorContinuityReceiptV2(receipt, baseInputV2, '2026-08-31T16:40:00.001Z');
    expect(expired.state).toBe('stale');
    expect(expired.reasons).toContain('receipt_expired');
    expect(expired.continuityMayAuthorizeAction).toBe(false);

    const forged = { ...receipt, authorizing: true } as unknown as typeof receipt;
    const invalid = evaluateOperatorContinuityReceiptV2(forged, baseInputV2, NOW);
    expect(invalid.state).toBe('invalid');
    expect(invalid.reasons).toContain('receipt_invalid');
    expect(invalid.continuityMayAuthorizeAction).toBe(false);
  });
});
