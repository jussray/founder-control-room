import { describe, expect, it } from 'vitest';
import {
  governanceObservationFromVerdict,
  summarizeGovernanceObservations,
} from './governanceAnalytics.js';
import type { GovernedActionVerdict } from './governedIntelligence.js';

function verdict(overrides: Partial<GovernedActionVerdict> = {}): GovernedActionVerdict {
  return {
    decision: 'reconfirm',
    reasons: ['No valid proof contract supports required claim: exact_production_version_verified.'],
    selectedIntent: {
      id: 'current',
      source: 'current_user',
      scope: ['deploy'],
      intentHash: 'hash',
      issuedAt: '2026-08-17T03:40:00.000Z',
      authenticated: true,
    },
    lineage: {
      evaluatedAt: '2026-08-17T03:45:00.000Z',
      intentId: 'current',
      memoryIds: ['memory-1'],
      proofIds: [],
      recoveryPlanId: 'recovery-1',
      authorizationId: null,
      proposalId: null,
      proposalHash: null,
      actionHash: null,
      exactVersion: null,
    },
    ...overrides,
  };
}

describe('sanitized governance analytics', () => {
  it('emits category-level evidence without raw reason text, lineage ids, hashes, or payloads', () => {
    const observation = governanceObservationFromVerdict({
      projectId: 'sekret-bip',
      risk: 'consequential',
      recoveryLevel: 'R2',
      verdict: verdict(),
    });

    expect(observation).toEqual({
      projectId: 'sekret-bip',
      decision: 'reconfirm',
      risk: 'consequential',
      intentSource: 'current_user',
      memoryCount: 1,
      proofCount: 0,
      recoveryLevel: 'R2',
      blockCategories: ['proof_missing_or_invalid'],
    });
    const serialized = JSON.stringify(observation);
    expect(serialized).not.toContain('exact_production_version_verified');
    expect(serialized).not.toContain('memory-1');
    expect(serialized).not.toContain('recovery-1');
  });

  it('separates stale-memory, intent-conflict, recovery, and hard-constraint failures', () => {
    const observations = [
      governanceObservationFromVerdict({
        projectId: 'a', risk: 'consequential', verdict: verdict({ reasons: ['memory-runtime: Consequential action requires memory re-verification within 24 hours.'] }),
      }),
      governanceObservationFromVerdict({
        projectId: 'b', risk: 'consequential', verdict: verdict({ selectedIntent: null, reasons: ['Conflicting equally current intents require explicit re-confirmation.'] }),
      }),
      governanceObservationFromVerdict({
        projectId: 'c', risk: 'consequential', verdict: verdict({ decision: 'deny', reasons: ['Consequential action requires a checkpoint reference.'] }),
      }),
      governanceObservationFromVerdict({
        projectId: 'd', risk: 'consequential', verdict: verdict({ decision: 'deny', selectedIntent: null, reasons: ['Hard constraint: live execution is disabled'] }),
      }),
    ];

    const summary = summarizeGovernanceObservations(observations);
    expect(summary.total).toBe(4);
    expect(summary.blockCategoryCounts.memory_stale_or_invalid).toBe(1);
    expect(summary.blockCategoryCounts.intent_conflict).toBe(1);
    expect(summary.blockCategoryCounts.recovery_insufficient).toBe(1);
    expect(summary.blockCategoryCounts.hard_constraint).toBe(1);
    expect(summary.reconfirmRate).toBe(0.5);
    expect(summary.denyRate).toBe(0.5);
  });

  it('distinguishes missing, misbound, replayed, and stale execution authorizations', () => {
    const observations = [
      governanceObservationFromVerdict({
        projectId: 'missing', risk: 'consequential', verdict: verdict({ reasons: ['Consequential action requires a bound execution authorization plus proposal and action hashes.'] }),
      }),
      governanceObservationFromVerdict({
        projectId: 'binding', risk: 'consequential', verdict: verdict({ reasons: ['Execution authorization is bound to a different action.'] }),
      }),
      governanceObservationFromVerdict({
        projectId: 'replay', risk: 'consequential', verdict: verdict({ reasons: ['Execution authorization has already been consumed.'] }),
      }),
      governanceObservationFromVerdict({
        projectId: 'stale', risk: 'consequential', verdict: verdict({ reasons: ['Execution authorization is stale or expired.'] }),
      }),
    ];

    const summary = summarizeGovernanceObservations(observations);
    expect(summary.blockCategoryCounts.execution_authorization_missing).toBe(1);
    expect(summary.blockCategoryCounts.execution_authorization_binding).toBe(1);
    expect(summary.blockCategoryCounts.execution_authorization_replay).toBe(1);
    expect(summary.blockCategoryCounts.execution_authorization_stale_or_revoked).toBe(1);
  });

  it('reports allow/reconfirm/deny rates without inventing percentages on an empty sample', () => {
    expect(summarizeGovernanceObservations([])).toMatchObject({
      total: 0,
      allowRate: 0,
      reconfirmRate: 0,
      denyRate: 0,
      averageMemoryEvidence: 0,
      averageProofEvidence: 0,
    });

    const summary = summarizeGovernanceObservations([
      governanceObservationFromVerdict({ projectId: 'a', risk: 'observe', verdict: verdict({ decision: 'allow', reasons: ['Governed action contract satisfied.'] }) }),
      governanceObservationFromVerdict({ projectId: 'b', risk: 'reversible', verdict: verdict() }),
      governanceObservationFromVerdict({ projectId: 'c', risk: 'consequential', verdict: verdict({ decision: 'deny', reasons: ['Irreversible action cannot be autonomously authorized by this contract.'] }) }),
    ]);

    expect(summary.allowRate).toBe(0.3333);
    expect(summary.reconfirmRate).toBe(0.3333);
    expect(summary.denyRate).toBe(0.3333);
  });
});
