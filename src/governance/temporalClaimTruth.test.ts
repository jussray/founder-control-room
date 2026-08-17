import { describe, expect, it, vi } from 'vitest';
import {
  TEMPORAL_CLAIM_TRUTH_CONTRACT,
  revalidateTemporalPublicClaims,
  temporalClaimTruthContextHash,
  temporalTruthAnalytics,
  type TemporalClaimTruthContext,
} from './temporalClaimTruth.js';

const PROPOSAL = 'a'.repeat(64);
const PAYLOAD = 'b'.repeat(64);
const SOURCE = 'c'.repeat(40);
const NEWER = 'd'.repeat(40);

function context(claimClass: TemporalClaimTruthContext['claims'][number]['claimClass']): TemporalClaimTruthContext {
  return {
    contract: TEMPORAL_CLAIM_TRUTH_CONTRACT,
    proposalHash: PROPOSAL,
    publicPayloadHash: PAYLOAD,
    claims: [{
      claimId: 'shipping-progress',
      claimClass,
      evidenceRef: 'github:proof',
      evidenceScope: 'implementation-shipped',
      exactVersion: claimClass === 'current_runtime' || claimClass === 'metric' ? null : SOURCE,
    }],
  };
}

const canonicalClaims = [{
  claimId: 'shipping-progress',
  evidenceRef: 'github:proof',
  evidenceScope: 'implementation-shipped',
}];

describe('temporal public-claim truth', () => {
  it('preserves historical truth even after main moves', async () => {
    const truth = context('historical_version');
    const resolver = { currentVersion: vi.fn().mockResolvedValue(NEWER) };
    const receipt = await revalidateTemporalPublicClaims({
      context: truth,
      canonicalClaims,
      sourceRepo: 'jussray/founder-control-room',
      sourceCommitSha: SOURCE,
      expectedProposalHash: PROPOSAL,
      expectedPublicPayloadHash: PAYLOAD,
      confirmationTruthContextHash: temporalClaimTruthContextHash(truth),
      resolver,
      now: new Date('2026-08-17T18:30:00.000Z'),
    });

    expect(receipt.publishSafe).toBe(true);
    expect(receipt.claims[0].state).toBe('HISTORICAL_VERIFIED');
    expect(receipt.claims[0].displayLabel).toContain('Historical');
    expect(resolver.currentVersion).not.toHaveBeenCalled();
  });

  it('marks a once-current repo claim superseded when main changes', async () => {
    const truth = context('current_repo_state');
    const receipt = await revalidateTemporalPublicClaims({
      context: truth,
      canonicalClaims,
      sourceRepo: 'jussray/founder-control-room',
      sourceCommitSha: SOURCE,
      expectedProposalHash: PROPOSAL,
      expectedPublicPayloadHash: PAYLOAD,
      confirmationTruthContextHash: temporalClaimTruthContextHash(truth),
      resolver: { currentVersion: vi.fn().mockResolvedValue(NEWER) },
      now: new Date('2026-08-17T18:30:00.000Z'),
    });

    expect(receipt.publishSafe).toBe(false);
    expect(receipt.supersededCount).toBe(1);
    expect(receipt.claims[0]).toMatchObject({
      state: 'SUPERSEDED',
      exactVersion: SOURCE,
      currentVersion: NEWER,
    });
    expect(temporalTruthAnalytics(receipt).staleTruthPrevented).toBe(true);
  });

  it('re-verifies current repo state when exact head is unchanged', async () => {
    const truth = context('current_repo_state');
    const receipt = await revalidateTemporalPublicClaims({
      context: truth,
      canonicalClaims,
      sourceRepo: 'jussray/founder-control-room',
      sourceCommitSha: SOURCE,
      expectedProposalHash: PROPOSAL,
      expectedPublicPayloadHash: PAYLOAD,
      confirmationTruthContextHash: temporalClaimTruthContextHash(truth),
      resolver: { currentVersion: vi.fn().mockResolvedValue(SOURCE) },
      now: new Date('2026-08-17T18:30:00.000Z'),
    });

    expect(receipt.publishSafe).toBe(true);
    expect(receipt.currentCount).toBe(1);
    expect(receipt.claims[0].state).toBe('CURRENT_VERIFIED');
    expect(receipt.claims[0].worldValidAt).toBe('2026-08-17T18:30:00.000Z');
  });

  it('blocks runtime and metric claims until a dedicated live verifier exists', async () => {
    for (const claimClass of ['current_runtime', 'metric'] as const) {
      const truth = context(claimClass);
      const receipt = await revalidateTemporalPublicClaims({
        context: truth,
        canonicalClaims,
        sourceRepo: 'jussray/founder-control-room',
        sourceCommitSha: SOURCE,
        expectedProposalHash: PROPOSAL,
        expectedPublicPayloadHash: PAYLOAD,
        confirmationTruthContextHash: temporalClaimTruthContextHash(truth),
        resolver: { currentVersion: vi.fn() },
        now: new Date('2026-08-17T18:30:00.000Z'),
      });
      expect(receipt.publishSafe).toBe(false);
      expect(receipt.claims[0].state).toBe('REVALIDATION_REQUIRED');
    }
  });

  it('rejects changed evidence binding, missing classifications, and a forged truth-context hash', async () => {
    const truth = context('historical_version');
    const cases: TemporalClaimTruthContext[] = [
      { ...truth, claims: [] },
      { ...truth, claims: [{ ...truth.claims[0], evidenceRef: 'github:different' }] },
    ];

    for (const value of cases) {
      const receipt = await revalidateTemporalPublicClaims({
        context: value,
        canonicalClaims,
        sourceRepo: 'jussray/founder-control-room',
        sourceCommitSha: SOURCE,
        expectedProposalHash: PROPOSAL,
        expectedPublicPayloadHash: PAYLOAD,
        confirmationTruthContextHash: temporalClaimTruthContextHash(value),
        resolver: { currentVersion: vi.fn() },
        now: new Date('2026-08-17T18:30:00.000Z'),
      });
      expect(receipt.publishSafe).toBe(false);
      expect(receipt.claims[0].state).toBe('INVALID');
    }

    const forged = await revalidateTemporalPublicClaims({
      context: truth,
      canonicalClaims,
      sourceRepo: 'jussray/founder-control-room',
      sourceCommitSha: SOURCE,
      expectedProposalHash: PROPOSAL,
      expectedPublicPayloadHash: PAYLOAD,
      confirmationTruthContextHash: 'e'.repeat(64),
      resolver: { currentVersion: vi.fn() },
      now: new Date('2026-08-17T18:30:00.000Z'),
    });
    expect(forged.publishSafe).toBe(false);
    expect(forged.claims[0].displayLabel).toContain('confirmation hash');
  });
});
