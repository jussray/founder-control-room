import { describe, expect, it, vi } from 'vitest';
import {
  buildTemporalClaimTruthContextFromCanonical,
  revalidateTemporalPublicClaims,
  temporalClaimTextDomainErrors,
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
      'The product supports verified scheduling and was tested at this version.',
    ]) {
      const receipt = await verify('historical_version', NEWER, claimText);
      expect(receipt.publishSafe).toBe(false);
      expect(receipt.claims[0].state).toBe('INVALID');
      expect(receipt.claims[0].displayLabel).toContain('current-state language');
    }
  });

  it('rejects runtime truth mislabeled as current repository truth', async () => {
    for (const claimText of [
      'Production is live and reachable.',
      'The API service is healthy and available.',
      'The app is serving production traffic.',
    ]) {
      const receipt = await verify('current_repo_state', SOURCE, claimText);
      expect(receipt.publishSafe).toBe(false);
      expect(receipt.claims[0].state).toBe('INVALID');
      expect(receipt.claims[0].displayLabel).toContain('requires current_runtime evidence');
    }
  });

  it('keeps runtime-state proximity bounded at the historical 80-character gap', () => {
    const withinForward = `production ${'x'.repeat(78)} live`;
    const beyondForward = `production ${'x'.repeat(79)} live`;
    const withinReverse = `healthy ${'x'.repeat(78)} api`;
    const acrossLineBreak = 'production\nlive';

    expect(temporalClaimTextDomainErrors({
      label: 'claim',
      text: withinForward,
      temporalClass: 'current_repo_state',
    })).toEqual(expect.arrayContaining([
      expect.stringContaining('requires current_runtime evidence'),
    ]));

    expect(temporalClaimTextDomainErrors({
      label: 'claim',
      text: withinReverse,
      temporalClass: 'current_repo_state',
    })).toEqual(expect.arrayContaining([
      expect.stringContaining('requires current_runtime evidence'),
    ]));

    expect(temporalClaimTextDomainErrors({
      label: 'claim',
      text: beyondForward,
      temporalClass: 'current_repo_state',
    })).not.toEqual(expect.arrayContaining([
      expect.stringContaining('requires current_runtime evidence'),
    ]));

    expect(temporalClaimTextDomainErrors({
      label: 'claim',
      text: acrossLineBreak,
      temporalClass: 'current_repo_state',
    })).not.toEqual(expect.arrayContaining([
      expect.stringContaining('requires current_runtime evidence'),
    ]));
  });

  it('keeps metric claims on analytics authority even when wording is historical', async () => {
    for (const claimText of [
      'We now have 54 followers.',
      'The product has 120 users.',
      'Conversion is 12.5%.',
      'Reached 54 followers during this build period.',
      'Recorded 13 engagements during the release window.',
      'Reached 2,160 members during the campaign.',
      'Received 9 comments after launch.',
    ]) {
      const temporalClass: TemporalClaimClass = claimText.startsWith('Reached') || claimText.startsWith('Recorded') || claimText.startsWith('Received')
        ? 'historical_version'
        : 'current_repo_state';
      const receipt = await verify(temporalClass, temporalClass === 'historical_version' ? NEWER : SOURCE, claimText);
      expect(receipt.publishSafe).toBe(false);
      expect(receipt.claims[0].state).toBe('INVALID');
      expect(receipt.claims[0].displayLabel).toContain('requires metric evidence');
      expect(receipt.claims[0].displayLabel).toContain('non-metric evidence cannot establish analytics truth');
    }

    const metric = await verify('metric', SOURCE, 'Reached 54 followers during this build period.');
    expect(metric.publishSafe).toBe(false);
    expect(metric.claims[0].state).toBe('REVALIDATION_REQUIRED');
    expect(metric.claims[0].displayLabel).toContain('fresh analytics read required');
  });

  it('exports one semantic-domain classifier for exact copy and canonical claims', () => {
    expect(temporalClaimTextDomainErrors({
      label: 'approved deferred copy',
      text: 'Reached 54 followers during this build period.',
      temporalClass: 'historical_version',
    })).toEqual(expect.arrayContaining([
      expect.stringContaining('requires metric evidence'),
    ]));
    expect(temporalClaimTextDomainErrors({
      label: 'approved deferred copy',
      text: 'The product supports verified scheduling and was tested at this version.',
      temporalClass: 'historical_version',
    })).toEqual(expect.arrayContaining([
      expect.stringContaining('current-state language'),
    ]));
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
