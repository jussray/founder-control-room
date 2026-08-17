import { describe, expect, it } from 'vitest';
import {
  adjudicateMemoryWrite,
  evaluateGovernedAction,
  memoryCanAuthorize,
  proofSupportsClaim,
  resolveTemporalIntent,
  type GovernedMemory,
  type ProofContract,
  type RecoveryPlan,
  type TemporalIntent,
} from './governedIntelligence.js';

const NOW = new Date('2026-08-17T03:30:00.000Z');
const HASH = 'a'.repeat(64);

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

function memory(overrides: Partial<GovernedMemory> = {}): GovernedMemory {
  return {
    id: 'memory-runtime',
    factHash: 'fact-v1',
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
    artifactHash: HASH,
    verificationMethod: 'exact-head runtime read-back',
    observedAt: '2026-08-17T03:15:00.000Z',
    exactVersion: 'abc123',
    environment: 'production',
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

describe('governed intelligence temporal authority', () => {
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

  it('keeps FutureYou advisory instead of silently authorizing consequential action', () => {
    const verdict = evaluateGovernedAction({
      requiredScope: 'deploy',
      risk: 'consequential',
      intents: [intent({ source: 'future_you', authenticated: false })],
      recoveryPlan: recovery(),
      explicitApproval: true,
      now: NOW,
    });

    expect(verdict.decision).toBe('reconfirm');
    expect(verdict.reasons.join(' ')).toContain('cannot silently authorize');
  });

  it('does not let revoked Current You intent remain active authority', () => {
    const resolved = resolveTemporalIntent([
      intent({ revokedAt: '2026-08-17T03:21:00.000Z' }),
      intent({
        id: 'history',
        source: 'historical_user',
        intentHash: 'older-plan',
        issuedAt: '2026-08-16T03:20:00.000Z',
        authenticated: true,
      }),
    ], 'deploy', NOW);

    expect(resolved.mode).toBe('advisory');
    expect(resolved.selected?.id).toBe('history');
  });

  it('requires explicit reconfirmation for equally current conflicting authenticated intents', () => {
    const resolved = resolveTemporalIntent([
      intent({ id: 'a', intentHash: 'ship-a' }),
      intent({ id: 'b', intentHash: 'ship-b' }),
    ], 'deploy', NOW);

    expect(resolved.mode).toBe('conflict');
    expect(resolved.selected).toBeNull();
  });
});

describe('governed memory', () => {
  it('lets a newer authenticated Current You correction supersede FutureYou memory', () => {
    const result = adjudicateMemoryWrite(
      memory({
        id: 'future-memory',
        source: 'future_you',
        factHash: 'old-fact',
        authenticated: false,
        observedAt: '2026-08-16T03:10:00.000Z',
      }),
      memory({ id: 'current-correction', factHash: 'new-fact' }),
      NOW,
    );

    expect(result).toMatchObject({
      decision: 'supersede',
      winnerId: 'current-correction',
      loserId: 'future-memory',
    });
  });

  it('does not let FutureYou overwrite authenticated Current You memory', () => {
    const result = adjudicateMemoryWrite(
      memory({ id: 'current-memory', factHash: 'current-fact' }),
      memory({
        id: 'future-write',
        source: 'future_you',
        factHash: 'projected-fact',
        authenticated: false,
        observedAt: '2026-08-17T03:20:00.000Z',
      }),
      NOW,
    );

    expect(result).toMatchObject({
      decision: 'preserve_existing',
      winnerId: 'current-memory',
      loserId: 'future-write',
    });
  });

  it('blocks stale verified memory from authorizing consequential action', () => {
    const result = memoryCanAuthorize(memory({
      observedAt: '2026-08-14T03:10:00.000Z',
      lastVerifiedAt: '2026-08-14T03:10:00.000Z',
    }), 'consequential', NOW);

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('within 24 hours');
  });
});

describe('proof contracts', () => {
  it('refuses to promote a proof beyond the claims it explicitly covers', () => {
    expect(proofSupportsClaim(proof(), 'production_sha_matches', NOW, 'abc123').supported).toBe(true);
    expect(proofSupportsClaim(proof(), 'payment_settled', NOW).supported).toBe(false);
    expect(proofSupportsClaim(proof(), 'all_devices_healthy', NOW).supported).toBe(false);
  });

  it('rejects exact-version drift even when the proof claim otherwise matches', () => {
    const result = proofSupportsClaim(proof(), 'production_sha_matches', NOW, 'different-sha');
    expect(result.supported).toBe(false);
    expect(result.reason).toContain('exact version');
  });
});

describe('governed action contract', () => {
  it('allows a consequential action only when intent, memory, proof, approval, and rollback all line up', () => {
    const verdict = evaluateGovernedAction({
      requiredScope: 'deploy',
      risk: 'consequential',
      intents: [intent()],
      memories: [memory()],
      requiredMemoryIds: ['memory-runtime'],
      proofs: [proof()],
      requiredClaims: [{ claim: 'production_sha_matches', exactVersion: 'abc123' }],
      recoveryPlan: recovery(),
      explicitApproval: true,
      now: NOW,
    });

    expect(verdict.decision).toBe('allow');
    expect(verdict.lineage).toMatchObject({
      intentId: 'intent-current',
      memoryIds: ['memory-runtime'],
      proofIds: ['proof-runtime'],
      recoveryPlanId: 'recovery-1',
    });
  });

  it('denies consequential action when the rollback plan is structurally incomplete', () => {
    const verdict = evaluateGovernedAction({
      requiredScope: 'deploy',
      risk: 'consequential',
      intents: [intent()],
      recoveryPlan: recovery({ checkpointRef: null }),
      explicitApproval: true,
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
      explicitApproval: true,
      now: NOW,
    });

    expect(verdict.decision).toBe('deny');
    expect(verdict.reasons.join(' ')).toContain('cannot be autonomously authorized');
  });

  it('hard constraints outrank even fresh authenticated Current You approval', () => {
    const verdict = evaluateGovernedAction({
      requiredScope: 'deploy',
      risk: 'consequential',
      intents: [intent()],
      recoveryPlan: recovery(),
      explicitApproval: true,
      hardConstraintViolations: ['requested action violates a non-overridable safety policy'],
      now: NOW,
    });

    expect(verdict.decision).toBe('deny');
    expect(verdict.selectedIntent).toBeNull();
    expect(verdict.reasons[0]).toContain('Hard constraint');
  });
});
