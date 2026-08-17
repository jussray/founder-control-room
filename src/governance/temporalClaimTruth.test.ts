import { describe, expect, it, vi } from 'vitest';
import {
  TEMPORAL_CLAIM_TRUTH_CONTRACT,
  buildTemporalClaimTruthContextFromCanonical,
  revalidateTemporalPublicClaims,
  temporalClaimTruthContextHash,
  temporalTruthAnalytics,
  type CanonicalPublicClaim,
  type TemporalClaimClass,
  type TemporalClaimTruthContext,
} from './temporalClaimTruth.js';

const PROPOSAL = 'a'.repeat(64);
const PAYLOAD = 'b'.repeat(64);
const SOURCE = 'c'.repeat(40);
const NEWER = 'd'.repeat(40);

function canonicalClaim(
  claimClass: TemporalClaimClass,
  claimText?: string,
): CanonicalPublicClaim {
  return {
    claimId: 'shipping-progress',
    text: claimText ?? (claimClass === 'historical_version'
      ? 'Built the exact publication proof boundary at this version.'
      : 'The repository state is current at the verified source version.'),
    evidenceRef: 'github:proof',
    evidenceScope: 'implementation-shipped',
    temporalClass: claimClass,
    temporalVersion: claimClass === 'current_runtime' || claimClass === 'metric' ? null : SOURCE,
  };
}

function context(claimClass: TemporalClaimClass, claimText?: string) {
  const canonicalClaims = [canonicalClaim(claimClass, claimText)];
  return {
    canonicalClaims,
    truth: buildTemporalClaimTruthContextFromCanonical({
      proposalHash: PROPOSAL,
      publicPayloadHash: PAYLOAD,
      claims: canonicalClaims,
    }),
  };
}

async function verify(
  claimClass: TemporalClaimClass,
  currentVersion: string,
  claimText?: string,
) {
  const { truth, canonicalClaims } = context(claimClass, claimText);
  return revalidateTemporalPublicClaims({
    context: truth,
    canonicalClaims,
    sourceRepo: 'jussray/founder-control-room',
    sourceCommitSha: SOURCE,
    expectedProposalHash: PROPOSAL,
    expectedPublicPayloadHash: PAYLOAD,
    confirmationTruthContextHash: temporalClaimTruthContextHash(truth),
    resolver: { currentVersion: vi.fn().mockResolvedValue(currentVersion) },
    now: new Date('2026-08-17T18:30:00.000Z'),
  });
}

describe('temporal public-claim truth', () => {
  it('preserves explicitly historical truth even after main moves', async () => {
    const receipt = await verify('historical_version', NEWER);
    expect(receipt.publishSafe).toBe(true);
    expect(receipt.claims[0].state).toBe('HISTORICAL_VERIFIED');
    expect(receipt.claims[0].displayLabel).toContain('Historical');
  });

  it('marks a once-current repo claim superseded when main changes', async () => {
    const receipt = await verify('current_repo_state', NEWER);
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
    const receipt = await verify('current_repo_state', SOURCE);
    expect(receipt.publishSafe).toBe(true);
    expect(receipt.currentCount).toBe(1);
    expect(receipt.claims[0].state).toBe('CURRENT_VERIFIED');
    expect(receipt.claims[0].worldValidAt).toBe('2026-08-17T18:30:00.000Z');
  });

  it('blocks runtime and metric claims until dedicated live verifiers exist', async () => {
    for (const claimClass of ['current_runtime', 'metric'] as const) {
      const receipt = await verify(claimClass, SOURCE);
      expect(receipt.publishSafe).toBe(false);
      expect(receipt.claims[0].state).toBe('REVALIDATION_REQUIRED');
    }
  });

  it('rejects caller relabeling of a proposal-bound current claim as historical', async () => {
    const { truth, canonicalClaims } = context('current_repo_state');
    const relabeled: TemporalClaimTruthContext = {
      ...truth,
      claims: truth.claims.map((claim) => ({ ...claim, claimClass: 'historical_version' })),
    };
    const receipt = await revalidateTemporalPublicClaims({
      context: relabeled,
      canonicalClaims,
      sourceRepo: 'jussray/founder-control-room',
      sourceCommitSha: SOURCE,
      expectedProposalHash: PROPOSAL,
      expectedPublicPayloadHash: PAYLOAD,
      confirmationTruthContextHash: temporalClaimTruthContextHash(relabeled),
      resolver: { currentVersion: vi.fn().mockResolvedValue(NEWER) },
      now: new Date('2026-08-17T18:30:00.000Z'),
    });
    expect(receipt.publishSafe).toBe(false);
    expect(receipt.claims[0].state).toBe('INVALID');
    expect(receipt.claims[0].displayLabel).toContain('class changed after proposal approval');
  });

  it('rejects current-state language disguised as a historical claim', async () => {
    for (const claimText of [
      'Production is live and verified at this version.',
      'The deployment is green and remains healthy.',
      'The system currently serves the verified release.',
    ]) {
      const receipt = await verify('historical_version', NEWER, claimText);
      expect(receipt.publishSafe).toBe(false);
      expect(receipt.claims[0].state).toBe('INVALID');
      expect(receipt.claims[0].displayLabel).toContain('current-state language');
    }
  });

  it('rejects changed evidence binding, missing classifications, and forged truth hash', async () => {
    const { truth, canonicalClaims } = context('historical_version');
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
