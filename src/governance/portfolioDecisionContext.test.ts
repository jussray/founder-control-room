import { describe, expect, it } from 'vitest';
import {
  decisionContextFromVerdict,
  decisionContextHash,
  type ContextBoundGovernedActionRequest,
} from './portfolioDecisionContext.js';
import { evaluatePortfolioGovernedAction } from './portfolioGovernanceProfiles.js';
import { createTruthLease } from '../lib/truthLease.js';

const NOW = new Date('2026-08-17T03:30:00.000Z');
const PROPOSAL_HASH = 'b'.repeat(64);
const ACTION_HASH = 'c'.repeat(64);

function request(): ContextBoundGovernedActionRequest {
  return {
    requiredScope: 'execute',
    risk: 'consequential',
    intents: [{
      id: 'intent-current',
      source: 'current_user',
      scope: ['execute'],
      intentHash: 'current-intent-v1',
      issuedAt: '2026-08-17T03:20:00.000Z',
      authenticated: true,
    }],
    memories: [{
      id: 'memory-goal',
      kind: 'goal',
      factHash: 'goal-v1',
      ownerId: 'founder',
      source: 'current_user',
      status: 'verified',
      observedAt: '2026-08-17T03:10:00.000Z',
      lastVerifiedAt: '2026-08-17T03:10:00.000Z',
      authenticated: true,
    }],
    requiredMemoryIds: ['memory-goal'],
    proofs: [
      {
        id: 'proof-intent',
        subject: 'PromptOS current intent',
        proves: ['current_intent_verified'],
        doesNotProve: [],
        artifactHash: 'a'.repeat(64),
        verificationMethod: 'exact intent verification',
        observedAt: '2026-08-17T03:15:00.000Z',
        exactVersion: 'abc123',
        freshForMs: 60 * 60 * 1000,
      },
      {
        id: 'proof-authority',
        subject: 'PromptOS execution authority',
        proves: ['execution_authority_verified'],
        doesNotProve: [],
        artifactHash: 'd'.repeat(64),
        verificationMethod: 'authority registry verification',
        observedAt: '2026-08-17T03:16:00.000Z',
        exactVersion: 'abc123',
        freshForMs: 60 * 60 * 1000,
      },
    ],
    recoveryPlan: {
      id: 'recovery-1',
      level: 'R2',
      checkpointRef: 'promptos:before',
      rollbackAction: 'restore previous PromptOS state',
      validationAction: 'verify restored state and authority',
    },
    proposalId: 'proposal-1',
    proposalHash: PROPOSAL_HASH,
    actionHash: ACTION_HASH,
    exactVersion: 'abc123',
    authorization: {
      id: 'authorization-1',
      actorId: 'founder',
      source: 'current_user',
      intentId: 'intent-current',
      intentHash: 'current-intent-v1',
      proposalId: 'proposal-1',
      proposalHash: PROPOSAL_HASH,
      actionHash: ACTION_HASH,
      scope: ['execute'],
      risk: 'consequential',
      exactVersion: 'abc123',
      issuedAt: '2026-08-17T03:20:00.000Z',
      expiresAt: '2026-08-17T04:00:00.000Z',
      authenticated: true,
    },
    authorizationReplayState: 'unused',
    now: NOW,
  };
}

function bindCurrentContext(input: ContextBoundGovernedActionRequest): ContextBoundGovernedActionRequest {
  const firstVerdict = evaluatePortfolioGovernedAction('jussray/promptos', 'execute', input);
  const snapshot = decisionContextFromVerdict(input, firstVerdict);
  expect(firstVerdict.decision).toBe('reconfirm');
  expect(firstVerdict.reasonCodes).toEqual(['execution_authorization_binding']);
  expect(snapshot).not.toBeNull();

  const contextHash = decisionContextHash(snapshot!);
  const lease = createTruthLease({
    claimHash: contextHash,
    claimClass: 'fcr/governed-decision-context@v1',
    verifiedAt: NOW.toISOString(),
    validUntil: new Date(NOW.getTime() + 30 * 60 * 1000).toISOString(),
    dependencies: [
      {
        key: 'memory:goal',
        authority: 'human-outcome',
        expectedDigest: '6'.repeat(64),
        maxObservationAgeMs: 60 * 60 * 1000,
      },
      {
        key: 'proof:intent',
        authority: 'runtime',
        expectedDigest: 'a'.repeat(64),
        maxObservationAgeMs: 60 * 60 * 1000,
      },
    ],
  });

  return {
    ...input,
    authorization: {
      ...input.authorization!,
      decisionContext: snapshot!,
      truthLeaseHash: lease.leaseHash,
    },
    truthLease: lease,
    truthUseBoundary: 'merge',
    truthObservations: [
      {
        key: 'memory:goal',
        authority: 'human-outcome',
        digest: '6'.repeat(64),
        observedAt: NOW.toISOString(),
      },
      {
        key: 'proof:intent',
        authority: 'runtime',
        digest: 'a'.repeat(64),
        observedAt: NOW.toISOString(),
      },
    ],
  };
}

describe('portfolio decision-context binding', () => {
  it('requires consequential approval to bind the exact authoritative decision context', () => {
    const unbound = request();
    const unboundVerdict = evaluatePortfolioGovernedAction('jussray/promptos', 'execute', unbound);
    expect(unboundVerdict.decision).toBe('reconfirm');
    expect(unboundVerdict.reasons.join(' ')).toContain('exact decision context');

    const bound = bindCurrentContext(unbound);
    expect(evaluatePortfolioGovernedAction('jussray/promptos', 'execute', bound).decision).toBe('allow');
  });

  it('invalidates approval when a required Current You memory changes after approval', () => {
    const bound = bindCurrentContext(request());
    const changed = {
      ...bound,
      memories: bound.memories?.map((memory) => memory.id === 'memory-goal'
        ? { ...memory, factHash: 'goal-v2', observedAt: '2026-08-17T03:25:00.000Z', lastVerifiedAt: '2026-08-17T03:25:00.000Z' }
        : memory),
    };

    const verdict = evaluatePortfolioGovernedAction('jussray/promptos', 'execute', changed);
    expect(verdict.decision).toBe('reconfirm');
    expect(verdict.reasonCodes).toEqual(['execution_authorization_binding']);
    expect(verdict.reasons.join(' ')).toContain('decision context no longer matches');
  });

  it('does not invalidate approval merely because advisory FutureYou context is present', () => {
    const bound = bindCurrentContext(request());
    const withAdvisory = {
      ...bound,
      intents: [
        ...bound.intents,
        {
          id: 'future-advice',
          source: 'future_you' as const,
          scope: ['execute'],
          intentHash: 'future-projection',
          issuedAt: '2026-08-17T03:25:00.000Z',
          authenticated: false,
        },
      ],
    };

    expect(evaluatePortfolioGovernedAction('jussray/promptos', 'execute', withAdvisory).decision).toBe('allow');
  });
});
