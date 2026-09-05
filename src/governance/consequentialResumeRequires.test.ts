import { describe, expect, it } from 'vitest';
import { createContinuityRecord, type ContinuityInspection } from '../lib/ultrathinkContinuity.js';
import {
  consequentialResumeIdempotencyKey,
  evaluateConsequentialResume,
  type ConsequentialGovernedActionRequest,
  type ConsequentialResumeInput,
} from './consequentialResumeRequires.js';

const SHA = 'a'.repeat(40);
const OTHER_SHA = 'b'.repeat(40);
const EVIDENCE_HASH = 'd'.repeat(64);
const PROPOSAL_HASH = 'e'.repeat(64);
const ACTION_HASH = 'f'.repeat(64);
const NOW = new Date('2026-09-05T19:00:00.000Z');

function continuity(): ContinuityInspection {
  const record = createContinuityRecord({
    namespace: 'fcr',
    missionId: 'CONSEQUENTIAL-RESUME-V1',
    continuationId: 'CNT-RESUME-001',
    parent: null,
    createdAt: '2026-09-05T18:50:00.000Z',
    createdBy: 'founder:current',
    freshnessPolicyMs: 60 * 60 * 1000,
    observedAt: '2026-09-05T18:50:00.000Z',
    authorityIdentity: {
      repo: 'jussray/founder-control-room',
      branch: 'codex/provider-neutral-founder-content-contracts',
      sha: SHA,
      runtime: null,
      externalRef: null,
    },
    evidenceRefs: [{
      kind: 'github-head',
      ref: `github:founder-control-room:carrier@${SHA}`,
      checksum: `sha256:${'c'.repeat(64)}`,
    }],
    historicalReceiptStatus: 'verified',
    truthPlane: 'source',
  });

  return {
    classification: 'UNCHANGED',
    reasons: ['authority_reobserved_unchanged'],
    record,
    chain: [record],
    revokedContinuationId: null,
    forkedParentIds: [],
    continuityMayAuthorizeAction: false,
    historicalReceiptStatus: 'verified',
  };
}

function action(overrides: Partial<ConsequentialGovernedActionRequest> = {}): ConsequentialGovernedActionRequest {
  const base: ConsequentialGovernedActionRequest = {
    requiredScope: 'provider:publish',
    risk: 'consequential',
    intents: [{
      id: 'intent-1',
      source: 'current_user',
      scope: ['provider:publish'],
      intentHash: 'intent-hash-v1',
      issuedAt: '2026-09-05T18:45:00.000Z',
      authenticated: true,
    }],
    proofs: [{
      id: 'proof-provider-ready',
      subject: 'provider-runtime',
      proves: ['provider_ready'],
      doesNotProve: ['business_outcome'],
      artifactHash: EVIDENCE_HASH,
      verificationMethod: 'provider read-back',
      observedAt: '2026-09-05T18:58:00.000Z',
      exactVersion: SHA,
      freshForMs: 60 * 60 * 1000,
    }],
    requiredClaims: [{ claim: 'provider_ready', exactVersion: SHA, maxAgeMs: 60 * 60 * 1000 }],
    recoveryPlan: {
      id: 'recovery-1',
      level: 'R2',
      checkpointRef: 'checkpoint:provider-before-publish',
      rollbackAction: 'restore provider draft state',
      validationAction: 'independently re-read provider state',
    },
    proposalId: 'proposal-1',
    proposalHash: PROPOSAL_HASH,
    actionHash: ACTION_HASH,
    exactVersion: SHA,
    authorization: {
      id: 'authorization-1',
      actorId: 'founder-current',
      source: 'current_user',
      intentId: 'intent-1',
      intentHash: 'intent-hash-v1',
      proposalId: 'proposal-1',
      proposalHash: PROPOSAL_HASH,
      actionHash: ACTION_HASH,
      scope: ['provider:publish'],
      risk: 'consequential',
      exactVersion: SHA,
      issuedAt: '2026-09-05T18:55:00.000Z',
      expiresAt: '2026-09-05T19:30:00.000Z',
      authenticated: true,
    },
    authorizationReplayState: 'unused',
  };
  return { ...base, ...overrides };
}

function input(overrides: Partial<ConsequentialResumeInput> = {}): ConsequentialResumeInput {
  const continuityValue = overrides.continuity ?? continuity();
  const actionValue = overrides.action ?? action();
  const record = continuityValue.record;
  if (!record) throw new Error('test continuity record required');
  const key = consequentialResumeIdempotencyKey({
    continuationId: record.continuationId,
    stateHash: record.stateHash,
    proposalHash: actionValue.proposalHash,
    actionHash: actionValue.actionHash,
    exactVersion: actionValue.exactVersion,
  });
  return {
    continuity: continuityValue,
    action: actionValue,
    idempotency: { key, replayState: 'unused' },
    independentEvidence: [{
      witnessId: 'witness-provider-readback-1',
      proofId: 'proof-provider-ready',
      kind: 'provider_readback',
      artifactHash: EVIDENCE_HASH,
      observedAt: '2026-09-05T18:59:00.000Z',
      freshForMs: 60 * 60 * 1000,
    }],
    now: NOW,
    ...overrides,
  };
}

describe('fcr/consequential-resume-requires@v1', () => {
  it('returns eligibility without executing or transferring continuity authority', () => {
    const verdict = evaluateConsequentialResume(input());
    expect(verdict.disposition).toBe('eligible');
    expect(verdict.executionEligible).toBe(true);
    expect(verdict.executionPerformed).toBe(false);
    expect(verdict.continuityAuthorityTransferred).toBe(false);
    expect(verdict.governance?.decision).toBe('allow');
  });

  it('rejects freshness-lease-only continuity without explicit authority re-observation', () => {
    const value = continuity();
    value.reasons = ['within_freshness_lease'];
    const verdict = evaluateConsequentialResume(input({ continuity: value }));
    expect(verdict.disposition).toBe('reconfirm');
    expect(verdict.executionEligible).toBe(false);
  });

  it.each(['REVOKED', 'DIVERGED', 'CONFLICTING'] as const)('denies %s continuity', (classification) => {
    const value = continuity();
    value.classification = classification;
    value.reasons = ['adversarial_test'];
    const verdict = evaluateConsequentialResume(input({ continuity: value }));
    expect(verdict.disposition).toBe('deny');
    expect(verdict.executionPerformed).toBe(false);
  });

  it.each(['STALE', 'ADVANCED'] as const)('requires reconfirmation for %s continuity', (classification) => {
    const value = continuity();
    value.classification = classification;
    value.reasons = ['adversarial_test'];
    expect(evaluateConsequentialResume(input({ continuity: value })).disposition).toBe('reconfirm');
  });

  it('requires the action exact version to equal freshly re-observed continuity authority', () => {
    const changed = action({ exactVersion: OTHER_SHA });
    const verdict = evaluateConsequentialResume(input({ action: changed }));
    expect(verdict.disposition).toBe('reconfirm');
    expect(verdict.reasons.join(' ')).toContain('freshly re-observed continuity authority version');
  });

  it.each(['consumed', 'unknown'] as const)('rejects %s idempotency replay state', (replayState) => {
    const base = input();
    const verdict = evaluateConsequentialResume({ ...base, idempotency: { ...base.idempotency, replayState } });
    expect(verdict.disposition).toBe('reconfirm');
    expect(verdict.executionEligible).toBe(false);
  });

  it('rejects an idempotency key that is not bound to exact continuity/action state', () => {
    const base = input();
    const verdict = evaluateConsequentialResume({ ...base, idempotency: { key: 'wrong-key', replayState: 'unused' } });
    expect(verdict.disposition).toBe('reconfirm');
    expect(verdict.expectedIdempotencyKey).toMatch(/^fcr-consequential-resume-v1:[0-9a-f]{64}$/);
  });

  it('requires fresh independent evidence for the proof selected by governance', () => {
    const verdict = evaluateConsequentialResume(input({ independentEvidence: [] }));
    expect(verdict.disposition).toBe('reconfirm');
    expect(verdict.reasons).toContain('No independent witness is bound to selected proof proof-provider-ready.');
  });

  it('rejects a stale independent witness', () => {
    const base = input();
    const stale = [{ ...base.independentEvidence[0], observedAt: '2026-09-04T18:00:00.000Z', freshForMs: 60 * 60 * 1000 }];
    const verdict = evaluateConsequentialResume({ ...base, independentEvidence: stale });
    expect(verdict.disposition).toBe('reconfirm');
    expect(verdict.reasons.join(' ')).toContain('Independent witness is stale.');
  });

  it('fails closed when runtime input invents an unsupported witness kind', () => {
    const base = input();
    const forged = ([{ ...base.independentEvidence[0], kind: 'self_verified' }] as unknown) as ConsequentialResumeInput['independentEvidence'];
    const verdict = evaluateConsequentialResume({ ...base, independentEvidence: forged });
    expect(verdict.disposition).toBe('reconfirm');
    expect(verdict.reasons.join(' ')).toContain('Independent witness kind is unsupported.');
  });

  it('requires the independent witness identity to differ from the proof identity', () => {
    const base = input();
    const forged = [{ ...base.independentEvidence[0], witnessId: 'proof-provider-ready' }];
    const verdict = evaluateConsequentialResume({ ...base, independentEvidence: forged });
    expect(verdict.disposition).toBe('reconfirm');
    expect(verdict.reasons.join(' ')).toContain('identity distinct from the proof');
  });

  it('reuses the existing governed-action recovery gate instead of inventing a second one', () => {
    const weak = action({
      recoveryPlan: {
        id: 'recovery-weak',
        level: 'R1',
        rollbackAction: 'rollback',
        checkpointRef: 'checkpoint',
        validationAction: 'validate',
      },
    });
    const verdict = evaluateConsequentialResume(input({ action: weak }));
    expect(verdict.disposition).toBe('deny');
    expect(verdict.governance?.reasonCodes).toContain('recovery_insufficient');
  });

  it('reuses the existing authorization replay gate', () => {
    const consumed = action({ authorizationReplayState: 'consumed' });
    const verdict = evaluateConsequentialResume(input({ action: consumed }));
    expect(verdict.disposition).toBe('reconfirm');
    expect(verdict.governance?.reasonCodes).toContain('execution_authorization_replay');
  });

  it('fails closed if a forged runtime object tries to transfer continuity authority', () => {
    const value = continuity();
    const forged = {
      ...value,
      continuityMayAuthorizeAction: true,
      record: value.record ? { ...value.record, executionAuthority: true, proofCookie: { ...value.record.proofCookie, actionAuthority: true } } : null,
    } as unknown as ContinuityInspection;
    const verdict = evaluateConsequentialResume(input({ continuity: forged }));
    expect(verdict.disposition).toBe('deny');
    expect(verdict.executionPerformed).toBe(false);
  });
});
