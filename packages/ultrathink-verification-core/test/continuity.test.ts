import { describe, expect, it } from 'vitest';
import { createContinuityTransition } from '../src/continuity.js';
import type { MainEvidenceDecisionV0 } from '../src/contracts.v0.js';

const POLICY = `sha256:${'a'.repeat(64)}` as const;
const EVIDENCE = `sha256:${'b'.repeat(64)}` as const;
const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);

function decision(overrides: Partial<MainEvidenceDecisionV0> = {}): MainEvidenceDecisionV0 {
  return {
    kind: 'main-evidence-decision.v0',
    repo: 'jussray/founder-control-room',
    branch: 'main',
    authoritativeSha: SHA_B,
    lastVerifiedSha: SHA_A,
    state: 'STALE',
    reason: 'MAIN_SHA_CHANGED',
    policyHash: POLICY,
    missingWitnessIds: ['playwright'],
    failedWitnessIds: [],
    staleWitnessIds: [],
    mismatchedWitnessIds: [],
    unresolvableWitnessIds: [],
    nextRequiredAction: 'REACQUIRE_REQUIRED_WITNESSES',
    evaluatedAt: '2026-08-23T22:35:00.000Z',
    correlationId: 'decision-b',
    ...overrides,
  };
}

describe('continuity transition v0', () => {
  it('records VERIFIED A -> STALE B without losing last verified lineage', () => {
    const prior = decision({
      authoritativeSha: SHA_A,
      lastVerifiedSha: SHA_A,
      state: 'VERIFIED',
      reason: 'RECOVERY_COMPLETE',
      missingWitnessIds: [],
      nextRequiredAction: 'NO_ACTION_REQUIRED',
    });
    const next = decision();

    expect(createContinuityTransition({
      prior,
      next,
      evidenceFingerprint: EVIDENCE,
      occurredAt: '2026-08-23T22:36:00.000Z',
      correlationId: 'transition-b',
    })).toEqual({
      kind: 'continuity-transition.v0',
      repo: next.repo,
      branch: 'main',
      from: 'VERIFIED',
      to: 'STALE',
      reason: 'MAIN_SHA_CHANGED',
      authoritativeSha: SHA_B,
      lastVerifiedSha: SHA_A,
      policyHash: POLICY,
      evidenceFingerprint: EVIDENCE,
      priorTransitionId: undefined,
      occurredAt: '2026-08-23T22:36:00.000Z',
      correlationId: 'transition-b',
    });
  });

  it('records recovery without rewriting prior history', () => {
    const prior = decision();
    const next = decision({
      lastVerifiedSha: SHA_B,
      state: 'VERIFIED',
      reason: 'RECOVERY_COMPLETE',
      missingWitnessIds: [],
      nextRequiredAction: 'NO_ACTION_REQUIRED',
    });

    const transition = createContinuityTransition({
      prior,
      next,
      priorTransitionId: 'transition-stale-b',
      occurredAt: '2026-08-23T22:40:00.000Z',
      correlationId: 'transition-recovered-b',
    });

    expect(transition).toMatchObject({
      from: 'STALE',
      to: 'VERIFIED',
      lastVerifiedSha: SHA_B,
      priorTransitionId: 'transition-stale-b',
    });
    expect(prior.lastVerifiedSha).toBe(SHA_A);
  });

  it('rejects joining unrelated repository timelines', () => {
    expect(() => createContinuityTransition({
      prior: decision({ repo: 'jussray/other' }),
      next: decision(),
      occurredAt: '2026-08-23T22:40:00.000Z',
      correlationId: 'transition-invalid',
    })).toThrow('prior and next decisions must belong to the same repository branch');
  });

  it('is deterministic for identical inputs', () => {
    const input = {
      prior: decision(),
      next: decision({ state: 'BLOCKED', reason: 'WITNESS_FAILED' }),
      evidenceFingerprint: EVIDENCE,
      occurredAt: '2026-08-23T22:41:00.000Z',
      correlationId: 'transition-blocked',
    } as const;

    expect(createContinuityTransition(input)).toEqual(createContinuityTransition(input));
  });
});
