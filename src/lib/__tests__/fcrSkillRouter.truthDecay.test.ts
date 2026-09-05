import { describe, expect, it } from 'vitest';
import {
  V10_CAPABILITY_PLAN_CONTRACT,
  V10_CAPABILITY_SELECTOR,
  v10CapabilityPlanHash,
  type V10CapabilityPlan,
} from '../../founder-os-lab/capabilityKernel.js';
import { FCR_REQUIRED_PARALLEL_LENSES, routeFcrSkills } from '../fcrSkillRouter.js';

const HEAD = 'a'.repeat(40);
const REGISTRY_HASH = 'b'.repeat(64);

function plan(goal: string, capabilityIds: string[]): V10CapabilityPlan {
  const identity: Omit<V10CapabilityPlan, 'planHash'> = {
    contract: V10_CAPABILITY_PLAN_CONTRACT,
    selectedBy: V10_CAPABILITY_SELECTOR,
    goal,
    projectSlug: 'founder-control-room',
    expectedHeadSha: HEAD,
    registryHash: REGISTRY_HASH,
    requestedAuthority: 'reason',
    strategicLenses: ['futureyou', 'truthmode', 'redteam', ...FCR_REQUIRED_PARALLEL_LENSES],
    routingReason: 'Chief selected only the explicit truth-decay inspection capability.',
    capabilities: capabilityIds.map((id) => ({
      id,
      version: '1.0.0',
      origin: 'founder-native',
      owner: 'juss',
      sourceHash: 'c'.repeat(64),
      authorityCeiling: 'reason',
    })),
    proofRequirements: ['historical evidence', 'fresh at-use observation'],
    outcomeSignals: ['truth-decay-classified'],
    rollback: 'Discard the analysis; no mutation occurs.',
  };
  return { ...identity, planHash: v10CapabilityPlanHash(identity) };
}

function route(goal: string, ids: string[]) {
  return routeFcrSkills({
    goal,
    action: 'inspect',
    projectSlug: 'founder-control-room',
    expectedHeadSha: HEAD,
    expectedRegistryHash: REGISTRY_HASH,
    capabilityPlan: plan(goal, ids),
  });
}

describe('FCR truth-decay skill routing', () => {
  it('keeps /truth-decay inert when Chief does not select the capability', () => {
    const decision = route('/truth-decay audit why this once-true claim is unsafe now.', ['repo-truth']);

    expect(decision.untrustedWorkflowTokensInert).toBe(true);
    expect(decision.policyRequiredCapabilityIds).not.toContain('truth-decay-audit');
    expect(decision.missingPolicyCapabilityIds).toEqual([]);
    expect(decision.plannedCapabilityIds).toEqual(['repo-truth']);
    expect(decision.status).toBe('ready_for_runtime_discovery');
    expect(decision.executionAllowed).toBe(false);
  });

  it('accepts Chief-selected truth-decay capability only for runtime discovery and never grants execution', () => {
    const decision = route('/truth-decay audit why this once-true claim is unsafe now.', ['truth-decay-audit']);

    expect(decision.untrustedWorkflowTokensInert).toBe(true);
    expect(decision.policyRequiredCapabilityIds).not.toContain('truth-decay-audit');
    expect(decision.plannedCapabilityIds).toContain('truth-decay-audit');
    expect(decision.missingPolicyCapabilityIds).toEqual([]);
    expect(decision.missingParallelLenses).toEqual([]);
    expect(decision.status).toBe('ready_for_runtime_discovery');
    expect(decision.runtimeDiscoveryRequired).toBe(true);
    expect(decision.executionAllowed).toBe(false);
  });
});
