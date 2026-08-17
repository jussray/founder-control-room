import { describe, expect, it } from 'vitest';
import { adjudicateMemoryWrite, type GovernedMemory } from './governedIntelligence.js';

const NOW = new Date('2026-08-17T03:30:00.000Z');

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

describe('Current You memory precedence redteam', () => {
  it('lets authenticated Current You supersede a later-dated FutureYou preference', () => {
    const result = adjudicateMemoryWrite(
      preferenceMemory({
        id: 'future-preference',
        source: 'future_you',
        factHash: 'projected-preference',
        authenticated: false,
        observedAt: '2026-08-17T03:25:00.000Z',
        lastVerifiedAt: '2026-08-17T03:25:00.000Z',
      }),
      preferenceMemory({
        id: 'current-preference',
        factHash: 'current-preference',
        observedAt: '2026-08-17T03:10:00.000Z',
      }),
      NOW,
    );

    expect(result).toMatchObject({
      decision: 'supersede',
      winnerId: 'current-preference',
      loserId: 'future-preference',
    });
  });

  it('does not weaken objective-fact ordering by applying Current You preference rules to runtime evidence', () => {
    const result = adjudicateMemoryWrite(
      {
        id: 'provider-runtime',
        kind: 'runtime_state',
        factHash: 'production-unhealthy',
        ownerId: 'founder-control-room',
        source: 'provider_evidence',
        status: 'verified',
        observedAt: '2026-08-17T03:20:00.000Z',
        lastVerifiedAt: '2026-08-17T03:20:00.000Z',
        authenticated: true,
      },
      {
        id: 'user-runtime',
        kind: 'runtime_state',
        factHash: 'production-healthy',
        ownerId: 'founder-control-room',
        source: 'current_user',
        status: 'verified',
        observedAt: '2026-08-17T03:25:00.000Z',
        lastVerifiedAt: '2026-08-17T03:25:00.000Z',
        authenticated: true,
      },
      NOW,
    );

    expect(result.decision).toBe('dispute');
    expect(result.winnerId).toBe('provider-runtime');
  });
});
