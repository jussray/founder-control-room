import { describe, expect, it } from 'vitest';
import {
  adjudicateMemoryWrite,
  authorizationSupportsAction,
  evaluateGovernedAction,
  memoryCanAuthorize,
  proofSupportsClaim,
  resolveTemporalIntent,
  type ExecutionAuthorization,
  type GovernedMemory,
  type ProofContract,
  type RecoveryPlan,
  type TemporalIntent,
} from './governedIntelligence.js';

const NOW = new Date('2026-08-17T03:30:00.000Z');
const ARTIFACT_HASH = 'a'.repeat(64);
const PROPOSAL_HASH = 'b'.repeat(64);
const ACTION_HASH = 'c'.repeat(64);

function intent(overrides: Partial<TemporalIntent> = {}): TemporalIntent {
  return {
    id: 'intent-current',
    source: 'current_user',
    scope: ['deploy'],
    intentHash: 'current-intent-v1',
    issuedAt: '2026-08-17T03:20:00.000Z',
    authenticated: true,
    ...overrides,
  };
}

function runtimeMemory(overrides: Partial<GovernedMemory> = {}): GovernedMemory {
  return {
    id: 'memory-runtime',
    kind: 'runtime_state',
    factHash: 'runtime-fact-v1',
    ownerId: 'founder-control-room',
    source: 'provider_evidence',
    status: 'verified',
    observedAt: '2026-08-17T03:10:00.000Z',
    lastVerifiedAt: '2026-08-17T03:10:00.000Z',
    authenticated: true,
    ...overrides,
  };
}

function preferenceMemory(overrides: Partial<GovernedMemory> = {}): GovernedMemory {
  return {
    id: 'memory-preference',
    kind: 'preference',
    factHash: 'preference-v1',
    ownerId: 'founder',
    source: 'current_user',
    status: 'verified',
    observedAt: '2026-08-17T03:10:00.000Z',
    lastVerifiedAt: '2026-08-17T03:10:00.000Z',
    authenticated: true,
    ...overrides,
  };
}

function proof(overrides: Partial<ProofContract> = {}): ProofContract {
  return {
    id: 'proof-runtime',
    subject: 'founder-control-room production',
    proves: ['production_sha_matches'],
    doesNotProve: ['payment_settled'],
    artifactHash: ARTIFACT_HASH,
    verificationMethod: 'exact-head runtime read-back',
    observedAt: '2026-08-17T03:15:00.000Z',
    exactVersion: 'abc123',
    environment: 'production',
    freshForMs: 60 * 60 * 1000,
    ...overrides,
  };
}

function recovery(overrides: Partial<RecoveryPlan> = {}): RecoveryPlan {
  return {
    id: 'recovery-1',
    level: 'R2',
    checkpointRef: 'deployment:before',
    rollbackAction: 'restore previous deployment',
    validationAction: 'verify health and exact version',
    ...overrides,
  };
}

function authorization(overrides: Partial<ExecutionAuthorization> = {}): ExecutionAuthorization {
  return {
    id: 'authorization-1',
    actorId: 'founder',
    source: 'current_user',
    intentId: 'intent-current',
    proposalId: 'proposal-1',
    proposalHash: PROPOSAL_HASH,
    actionHash: ACTION_HASH,
    scope: ['deploy'],
    exactVersion: 'abc123',
    issuedAt: '2026-08-17T03:20:00.000Z',
    expiresAt: '2026-08-17T04:00:00.000Z',
    authenticated: true,
    ...overrides,
  };
}

describe('temporal authority', () => {
  it('lets fresh authenticated Current You outrank a FutureYou projection', () => {
    const resolved = resolveTemporalIntent([
      intent({
        id: 'future',
        source: 'future_you',
        intentHash: 'future-projection',
        issuedAt: '2026-08-17T03:25:00.000Z',
        authenticated: false,
      }),
      intent(),
    ], 'deploy', NOW);

    expect(resolved).toMatchObject({
      mode: 'authoritative',
      selected: { id: 'intent-current', source: 'current_user' },
    });
  });

  it('does not let advisory FutureYou suppress Current You through supersedes', () => {
    const resolved = resolveTemporalIntent([
      intent(),
      intent({
        id: 'future',
        source: 'future_you',
        authenticated: false,
        intentHash: 'future-projection',
        issuedAt: '2026-08-17T03:25:00.000Z',
        supersedes: ['intent-current'],
      }),
    ], 'deploy', NOW);

    expect(resolved.mode).toBe('authoritative');
    expect(resolved.selected?.id).toBe('intent-current');
  });

  it('does not let delegated authority supersede stronger Current You authority', () => {
    const resolved = resolveTemporalIntent([
      intent(),
      intent({
        id: 'delegate',
        source: 'delegated',
        intentHash: 'delegate-plan',
        issuedAt: '2026-08-17T03:25:00.000Z',
        supersedes: ['intent-current'],
      }),
    ], 'deploy', NOW);

    expect(resolved.mode).toBe('authoritative');
    expect(resolved.selected?.id).toBe('intent-current');
  });

  it('fails closed when expiry metadata is malformed', () => {
    const resolved = resolveTemporalIntent([intent({ expiresAt: 'not-a-time' })], 'deploy', NOW);
    expect(resolved.mode).toBe('missing');
  });

  it('does not let revoked Current You intent remain active authority', () => {
    const resolved = resolveTemporalIntent([
      intent({ revokedAt: '2026-08-17T03:21:00.000Z' }),
      intent({
        id: 'history',
        source: 'historical_user',
        intentHash: 'older-plan',
        issuedAt: '2026-08-16T03:20:00.000Z',
      }),
    ], 'deploy', NOW);

    expect(resolved.mode).toBe('advisory');
    expect(resolved.selected?.id).toBe('history');
  });

  it('requires reconfirmation for equally current conflicting authenticated intents', () => {
    const resolved = resolveTemporalIntent([
      intent({ id: 'a', intentHash: 'ship-a' }),
      intent({ id: 'b', intentHash: 'ship-b' }),
    ], 'deploy', NOW);

    expect(resolved.mode).toBe('conflict');
    expect(resolved.selected).toBeNull();
  });
});

describe('governed memory', () => {
  it('lets authenticated Current You correct a FutureYou preference', () => {
    const result = adjudicateMemoryWrite(
      preferenceMemory({
        id: 'future-preference',
        source: 'future_you',
        factHash: 'old-preference',
        authenticated: false,
        observedAt: '2026-08-16T03:10:00.000Z',
      }),
      preferenceMemory({ id: 'current-correction', factHash: 'new-preference' }),
      NOW,
    );

    expect(result).toMatchObject({
      decision: 'supersede',
      winnerId: 'current-correction',
      loserId: 'future-preference',
    });
  });

  it('does not let FutureYou overwrite authenticated Current You preference', () => {
    const result = adjudicateMemoryWrite(
      preferenceMemory({ id: 'current-preference', factHash: 'current-preference' }),
      preferenceMemory({
        id: 'future-write',
        source: 'future_you',
        factHash: 'projected-preference',
        authenticated: false,
        observedAt: '2026-08-17T03:20:00.000Z',
      }),
      NOW,
    );

    expect(result).toMatchObject({
      decision: 'preserve_existing',
      winnerId: 'current-preference',
      loserId: 'future-write',
    });
  });

  it('does not let a user assertion overwrite verified provider runtime evidence', () => {
    const result = adjudicateMemoryWrite(
      runtimeMemory({ id: 'provider-runtime', factHash: 'production-unhealthy' }),
      runtimeMemory({
        id: 'user-runtime-claim',
        source: 'current_user',
        factHash: 'production-healthy',
        observedAt: '2026-08-17T03:20:00.000Z',
      }),
      NOW,
    );

    expect(result.decision).toBe('dispute');
    expect(result.winnerId).toBe('provider-runtime');
    expect(result.reason).toContain('objective evidence');
  });

  it('lets a valid incoming observation supersede malformed existing memory', () => {
    const result = adjudicateMemoryWrite(
      runtimeMemory({ id: 'broken', observedAt: 'not-a-time' }),
      runtimeMemory({ id: 'fresh' }),
      NOW,
    );

    expect(result).toMatchObject({ decision: 'supersede', winnerId: 'fresh', loserId: 'broken' });
  });

  it('blocks stale verified runtime memory from authorizing consequential action', () => {
    const result = memoryCanAuthorize(runtimeMemory({
      observedAt: '2026-08-14T03:10:00.000Z',
      lastVerifiedAt: '2026-08-14T03:10:00.000Z',
    }), 'consequential', NOW);

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('within 24 hours');
  });

  it('blocks user-authored runtime belief from authorizing effectful action even when marked verified', () => {
    const result = memoryCanAuthorize(runtimeMemory({ source: 'current_user' }), 'reversible', NOW);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('objective provider or system evidence');
  });
});

describe('proof contracts', () => {
  it('refuses to promote proof beyond the claims it explicitly covers', () => {
    expect(proofSupportsClaim(proof(), 'production_sha_matches', NOW, 'abc123').supported).toBe(true);
    expect(proofSupportsClaim(proof(), 'payment_settled', NOW).supported).toBe(false);
    expect(proofSupportsClaim(proof(), 'all_devices_healthy', NOW).supported).toBe(false);
  });

  it('rejects exact-version drift even when the proof claim otherwise matches', () => {
    const result = proofSupportsClaim(proof(), 'production_sha_matches', NOW, 'different-sha');
    expect(result.supported).toBe(false);
    expect(result.reason).toContain('exact version');
  });

  it('rejects malformed proof expiry instead of treating it as no expiry', () => {
    const result = proofSupportsClaim(proof({ expiresAt: 'not-a-time' }), 'production_sha_matches', NOW, 'abc123');
    expect(result.supported).toBe(false);
    expect(result.reason).toContain('expiry');
  });
});

describe('bound execution authorization', () => {
  it('accepts fresh authorization bound to exact proposal, action, intent, scope, and version', () => {
    const result = authorizationSupportsAction(authorization(), {
      requiredScope: 'deploy',
      intentId: 'intent-current',
      proposalId: 'proposal-1',
      proposalHash: PROPOSAL_HASH,
      actionHash: ACTION_HASH,
      exactVersion: 'abc123',
      now: NOW,
    });

    expect(result.allowed).toBe(true);
  });

  it('rejects approval replay against a different action', () => {
    const result = authorizationSupportsAction(authorization(), {
      requiredScope: 'deploy',
      intentId: 'intent-current',
      proposalId: 'proposal-1',
      proposalHash: PROPOSAL_HASH,
      actionHash: 'd'.repeat(64),
      exactVersion: 'abc123',
      now: NOW,
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('different action');
  });

  it('rejects an already-consumed authorization id', () => {
    const result = authorizationSupportsAction(authorization(), {
      requiredScope: 'deploy',
      intentId: 'intent-current',
      proposalId: 'proposal-1',
      proposalHash: PROPOSAL_HASH,
      actionHash: ACTION_HASH,
      exactVersion: 'abc123',
      consumedAuthorizationIds: ['authorization-1'],
      now: NOW,
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('already been consumed');
  });

  it('rejects stale authorization even when hashes still match', () => {
    const result = authorizationSupportsAction(authorization({
      issuedAt: '2026-08-17T01:00:00.000Z',
      expiresAt: '2026-08-17T01:30:00.000Z',
    }), {
      requiredScope: 'deploy',
      intentId: 'intent-current',
      proposalId: 'proposal-1',
      proposalHash: PROPOSAL_HASH,
      actionHash: ACTION_HASH,
      exactVersion: 'abc123',
      now: NOW,
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('stale or expired');
  });
});

describe('governed action contract', () => {
  it('allows consequential action only when intent, objective memory, proof, bound approval, and rollback align', () => {
    const verdict = evaluateGovernedAction({
      requiredScope: 'deploy',
      risk: 'consequential',
      intents: [intent()],
      memories: [runtimeMemory()],
      requiredMemoryIds: ['memory-runtime'],
      proofs: [proof()],
      requiredClaims: [{ claim: 'production_sha_matches', exactVersion: 'abc123' }],
      recoveryPlan: recovery(),
      proposalId: 'proposal-1',
      proposalHash: PROPOSAL_HASH,
      actionHash: ACTION_HASH,
      exactVersion: 'abc123',
      authorization: authorization(),
      now: NOW,
    });

    expect(verdict.decision).toBe('allow');
    expect(verdict.lineage).toMatchObject({
      intentId: 'intent-current',
      memoryIds: ['memory-runtime'],
      proofIds: ['proof-runtime'],
      recoveryPlanId: 'recovery-1',
      authorizationId: 'authorization-1',
      proposalId: 'proposal-1',
      proposalHash: PROPOSAL_HASH,
      actionHash: ACTION_HASH,
      exactVersion: 'abc123',
    });
  });

  it('keeps FutureYou advisory instead of silently authorizing consequential action', () => {
    const verdict = evaluateGovernedAction({
      requiredScope: 'deploy',
      risk: 'consequential',
      intents: [intent({ source: 'future_you', authenticated: false })],
      recoveryPlan: recovery(),
      proposalId: 'proposal-1',
      proposalHash: PROPOSAL_HASH,
      actionHash: ACTION_HASH,
      authorization: authorization(),
      now: NOW,
    });

    expect(verdict.decision).toBe('reconfirm');
    expect(verdict.reasons.join(' ')).toContain('cannot silently authorize');
  });

  it('rejects consequential proof with no explicit freshness boundary', () => {
    const verdict = evaluateGovernedAction({
      requiredScope: 'deploy',
      risk: 'consequential',
      intents: [intent()],
      proofs: [proof({ freshForMs: null, expiresAt: null })],
      requiredClaims: [{ claim: 'production_sha_matches', exactVersion: 'abc123' }],
      recoveryPlan: recovery(),
      proposalId: 'proposal-1',
      proposalHash: PROPOSAL_HASH,
      actionHash: ACTION_HASH,
      exactVersion: 'abc123',
      authorization: authorization(),
      now: NOW,
    });

    expect(verdict.decision).toBe('reconfirm');
    expect(verdict.reasons.join(' ')).toContain('no explicit freshness boundary');
  });

  it('denies consequential action when rollback is structurally incomplete', () => {
    const verdict = evaluateGovernedAction({
      requiredScope: 'deploy',
      risk: 'consequential',
      intents: [intent()],
      recoveryPlan: recovery({ checkpointRef: null }),
      proposalId: 'proposal-1',
      proposalHash: PROPOSAL_HASH,
      actionHash: ACTION_HASH,
      authorization: authorization(),
      now: NOW,
    });

    expect(verdict.decision).toBe('deny');
    expect(verdict.reasons.join(' ')).toContain('checkpoint');
  });

  it('denies irreversible autonomous action even when other controls are present', () => {
    const verdict = evaluateGovernedAction({
      requiredScope: 'delete-production',
      risk: 'irreversible',
      intents: [intent({ scope: ['delete-production'] })],
      recoveryPlan: recovery({ level: 'R4' }),
      proposalId: 'proposal-1',
      proposalHash: PROPOSAL_HASH,
      actionHash: ACTION_HASH,
      authorization: authorization({ scope: ['delete-production'] }),
      now: NOW,
    });

    expect(verdict.decision).toBe('deny');
    expect(verdict.reasons.join(' ')).toContain('cannot be autonomously authorized');
  });

  it('hard constraints outrank fresh authenticated Current You authorization', () => {
    const verdict = evaluateGovernedAction({
      requiredScope: 'deploy',
      risk: 'consequential',
      intents: [intent()],
      recoveryPlan: recovery(),
      proposalId: 'proposal-1',
      proposalHash: PROPOSAL_HASH,
      actionHash: ACTION_HASH,
      authorization: authorization(),
      hardConstraintViolations: ['requested action violates a non-overridable safety policy'],
      now: NOW,
    });

    expect(verdict.decision).toBe('deny');
    expect(verdict.selectedIntent).toBeNull();
    expect(verdict.reasons[0]).toContain('Hard constraint');
  });
});
