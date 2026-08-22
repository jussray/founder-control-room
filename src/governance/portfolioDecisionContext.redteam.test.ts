import { describe, expect, it } from 'vitest';
import { createTruthLease, type TruthDependencyObservation } from '../lib/truthLease.js';
import {
  decisionContextHash,
  decisionContextsMatch,
  enforceConsequentialDecisionContext,
  type ContextBoundGovernedActionRequest,
  type DecisionContextSnapshot,
} from './portfolioDecisionContext.js';
import type { GovernedActionVerdict, TemporalIntent } from './governedIntelligence.js';

const EVALUATED_AT = '2026-08-17T03:30:00.000Z';
const DEPENDENCY_DIGEST = 'e'.repeat(64);

const intent: TemporalIntent = {
  id: 'intent-current',
  source: 'current_user',
  scope: ['execute'],
  intentHash: 'intent-v1',
  issuedAt: '2026-08-17T03:20:00.000Z',
  authenticated: true,
};

function snapshot(): DecisionContextSnapshot {
  return {
    intent: { id: 'intent-current', hash: 'intent-v1', source: 'current_user' },
    memories: [
      { id: 'b', factHash: 'fact-b', source: 'current_user' },
      { id: 'a', factHash: 'fact-a', source: 'provider_evidence' },
    ],
    proofs: [
      { id: 'proof-b', artifactHash: 'b'.repeat(64), exactVersion: 'abc123' },
      { id: 'proof-a', artifactHash: 'a'.repeat(64), exactVersion: 'abc123' },
    ],
    exactVersion: 'abc123',
  };
}

function currentLease(context: DecisionContextSnapshot = snapshot()) {
  return createTruthLease({
    claimHash: decisionContextHash(context),
    claimClass: 'governed-decision-context',
    verifiedAt: '2026-08-17T03:25:00.000Z',
    validUntil: '2026-08-17T03:55:00.000Z',
    dependencies: [{
      key: 'provider:production-runtime',
      authority: 'runtime',
      expectedDigest: DEPENDENCY_DIGEST,
      maxObservationAgeMs: 10 * 60 * 1000,
    }],
  });
}

function currentObservation(overrides: Partial<TruthDependencyObservation> = {}): TruthDependencyObservation {
  return {
    key: 'provider:production-runtime',
    authority: 'runtime',
    digest: DEPENDENCY_DIGEST,
    observedAt: '2026-08-17T03:29:00.000Z',
    ...overrides,
  };
}

function allowVerdict({ withEvidence = true }: { withEvidence?: boolean } = {}): GovernedActionVerdict {
  return {
    decision: 'allow',
    reasons: [
      'current_user intent is active, authenticated, scoped, and not legitimately superseded.',
      'Governed action contract satisfied.',
    ],
    reasonCodes: ['allow'],
    selectedIntent: intent,
    lineage: {
      evaluatedAt: EVALUATED_AT,
      intentId: intent.id,
      memoryIds: withEvidence ? ['a', 'b'] : [],
      proofIds: withEvidence ? ['proof-a', 'proof-b'] : [],
      recoveryPlanId: null,
      authorizationId: 'authorization-1',
      proposalId: 'proposal-1',
      proposalHash: 'c'.repeat(64),
      actionHash: 'd'.repeat(64),
      exactVersion: withEvidence ? 'abc123' : null,
    },
  };
}

function requestFor(
  approved: DecisionContextSnapshot,
  lease = currentLease(approved),
  overrides: Partial<ContextBoundGovernedActionRequest> = {},
): ContextBoundGovernedActionRequest {
  return {
    requiredScope: 'execute',
    risk: 'consequential',
    intents: [intent],
    memories: [
      {
        id: 'a', kind: 'runtime_state', factHash: 'fact-a', ownerId: 'fcr', source: 'provider_evidence', status: 'verified',
        observedAt: '2026-08-17T03:20:00.000Z', lastVerifiedAt: '2026-08-17T03:20:00.000Z', authenticated: true,
      },
      {
        id: 'b', kind: 'goal', factHash: 'fact-b', ownerId: 'founder', source: 'current_user', status: 'verified',
        observedAt: '2026-08-17T03:20:00.000Z', lastVerifiedAt: '2026-08-17T03:20:00.000Z', authenticated: true,
      },
    ],
    proofs: [
      {
        id: 'proof-a', subject: 'a', proves: ['a'], doesNotProve: [], artifactHash: 'a'.repeat(64), verificationMethod: 'provider',
        observedAt: '2026-08-17T03:20:00.000Z', exactVersion: 'abc123', freshForMs: 60 * 60 * 1000,
      },
      {
        id: 'proof-b', subject: 'b', proves: ['b'], doesNotProve: [], artifactHash: 'b'.repeat(64), verificationMethod: 'provider',
        observedAt: '2026-08-17T03:20:00.000Z', exactVersion: 'abc123', freshForMs: 60 * 60 * 1000,
      },
    ],
    exactVersion: 'abc123',
    authorization: {
      id: 'authorization-1', actorId: 'founder', source: 'current_user', intentId: intent.id, intentHash: intent.intentHash,
      proposalId: 'proposal-1', proposalHash: 'c'.repeat(64), actionHash: 'd'.repeat(64), scope: ['execute'], risk: 'consequential',
      issuedAt: '2026-08-17T03:20:00.000Z', expiresAt: '2026-08-17T03:50:00.000Z', authenticated: true,
      decisionContext: approved,
      truthLeaseHash: lease.leaseHash,
    },
    truthLease: lease,
    truthObservations: [currentObservation()],
    truthUseBoundary: 'deploy',
    ...overrides,
  };
}

describe('decision context Redteam', () => {
  it('compares semantic fields rather than caller object insertion order', () => {
    const approved = snapshot();
    const reordered = {
      exactVersion: 'abc123',
      proofs: [...approved.proofs].reverse().map((proof) => ({
        exactVersion: proof.exactVersion,
        artifactHash: proof.artifactHash,
        id: proof.id,
      })),
      memories: [...approved.memories].reverse().map((memory) => ({
        source: memory.source,
        factHash: memory.factHash,
        id: memory.id,
      })),
      intent: {
        source: approved.intent.source,
        hash: approved.intent.hash,
        id: approved.intent.id,
      },
    } as DecisionContextSnapshot;

    expect(decisionContextsMatch(approved, reordered)).toBe(true);
    expect(decisionContextHash(approved)).toBe(decisionContextHash(reordered));
  });

  it('does not tell the user a blocked consequential action already satisfied governance', () => {
    const request: ContextBoundGovernedActionRequest = {
      requiredScope: 'execute',
      risk: 'consequential',
      intents: [intent],
    };
    const blocked = enforceConsequentialDecisionContext(request, allowVerdict({ withEvidence: false }), 'consequential');
    expect(blocked.decision).toBe('reconfirm');
    expect(blocked.reasons).not.toContain('Governed action contract satisfied.');
    expect(blocked.reasons.join(' ')).toContain('exact decision context');
  });

  it('allows an unchanged approved context only when its Truth Lease is current at use time', () => {
    const approved = snapshot();
    const verdict = enforceConsequentialDecisionContext(requestFor(approved), allowVerdict(), 'consequential');
    expect(verdict.decision).toBe('allow');
  });

  it('requires a Truth Lease for evidence-dependent consequential execution', () => {
    const approved = snapshot();
    const verdict = enforceConsequentialDecisionContext(
      requestFor(approved, currentLease(approved), { truthLease: null }),
      allowVerdict(),
      'consequential',
    );
    expect(verdict.decision).toBe('reconfirm');
    expect(verdict.reasonCodes).toEqual(['execution_authorization_binding']);
    expect(verdict.reasons.join(' ')).toContain('Truth Lease');
    expect(verdict.reasons).not.toContain('Governed action contract satisfied.');
  });

  it('rejects a Truth Lease that belongs to a different decision context', () => {
    const approved = snapshot();
    const differentContext = snapshot();
    differentContext.proofs[0] = { ...differentContext.proofs[0], artifactHash: 'f'.repeat(64) };
    const wrongLease = currentLease(differentContext);
    const verdict = enforceConsequentialDecisionContext(
      requestFor(approved, wrongLease),
      allowVerdict(),
      'consequential',
    );
    expect(verdict.decision).toBe('reconfirm');
    expect(verdict.reasons.join(' ')).toContain('does not bind the exact current decision context');
  });

  it('rejects approval bound to a different Truth Lease even when the current lease is valid', () => {
    const approved = snapshot();
    const lease = currentLease(approved);
    const verdict = enforceConsequentialDecisionContext(
      requestFor(approved, lease, {
        authorization: {
          ...requestFor(approved, lease).authorization!,
          truthLeaseHash: 'f'.repeat(64),
        },
      }),
      allowVerdict(),
      'consequential',
    );
    expect(verdict.decision).toBe('reconfirm');
    expect(verdict.reasons.join(' ')).toContain('different Truth Lease');
  });

  it('reconfirms when fresh provider observation invalidates the approved truth', () => {
    const approved = snapshot();
    const verdict = enforceConsequentialDecisionContext(
      requestFor(approved, currentLease(approved), {
        truthObservations: [currentObservation({ digest: 'f'.repeat(64) })],
      }),
      allowVerdict(),
      'consequential',
    );
    expect(verdict.decision).toBe('reconfirm');
    expect(verdict.reasons.join(' ')).toContain('no longer matches verified truth');
  });

  it('reconfirms when the at-use observation is stale or missing', () => {
    const approved = snapshot();
    const stale = enforceConsequentialDecisionContext(
      requestFor(approved, currentLease(approved), {
        truthObservations: [currentObservation({ observedAt: '2026-08-17T03:10:00.000Z' })],
      }),
      allowVerdict(),
      'consequential',
    );
    expect(stale.decision).toBe('reconfirm');
    expect(stale.reasons.join(' ')).toContain('stale');

    const missing = enforceConsequentialDecisionContext(
      requestFor(approved, currentLease(approved), { truthObservations: [] }),
      allowVerdict(),
      'consequential',
    );
    expect(missing.decision).toBe('reconfirm');
    expect(missing.reasons.join(' ')).toContain('no at-use observation');
  });

  it('does not invent Truth Lease ceremony for a consequential decision with no factual evidence dependency', () => {
    const approved: DecisionContextSnapshot = {
      intent: { id: intent.id, hash: intent.intentHash, source: intent.source },
      memories: [],
      proofs: [],
      exactVersion: null,
    };
    const request: ContextBoundGovernedActionRequest = {
      requiredScope: 'execute',
      risk: 'consequential',
      intents: [intent],
      authorization: {
        id: 'authorization-1', actorId: 'founder', source: 'current_user', intentId: intent.id, intentHash: intent.intentHash,
        proposalId: 'proposal-1', proposalHash: 'c'.repeat(64), actionHash: 'd'.repeat(64), scope: ['execute'], risk: 'consequential',
        issuedAt: '2026-08-17T03:20:00.000Z', expiresAt: '2026-08-17T03:50:00.000Z', authenticated: true,
        decisionContext: approved,
      },
    };
    const verdict = enforceConsequentialDecisionContext(request, allowVerdict({ withEvidence: false }), 'consequential');
    expect(verdict.decision).toBe('allow');
  });
});
