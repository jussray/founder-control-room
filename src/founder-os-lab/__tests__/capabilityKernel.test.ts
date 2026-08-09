import { describe, expect, it } from 'vitest';
import {
  V10_CAPABILITY_PLAN_CONTRACT,
  V10_CAPABILITY_SELECTOR,
  validateV10CapabilityPlan,
  validateV10CapabilityPlanContext,
  v10CapabilityPlanHash,
  type V10CapabilityPlan,
} from '../capabilityKernel.js';

const SHA = 'a'.repeat(40);

function plan(overrides: Partial<V10CapabilityPlan> = {}): V10CapabilityPlan {
  const base: Omit<V10CapabilityPlan, 'planHash'> = {
    contract: V10_CAPABILITY_PLAN_CONTRACT,
    selectedBy: V10_CAPABILITY_SELECTOR,
    goal: 'Ship one bounded V10 capability.',
    projectSlug: 'founder-control-room',
    expectedHeadSha: SHA,
    registryHash: 'b'.repeat(64),
    requestedAuthority: 'draft',
    strategicLenses: ['futureyou', 'truthmode', 'redteam'],
    routingReason: 'Select the smallest capability set that can prove the next gate.',
    capabilities: [{
      id: 'goalfix',
      version: '1.0.0',
      origin: 'founder-native',
      owner: 'juss',
      sourceHash: 'c'.repeat(64),
      authorityCeiling: 'privileged',
    }],
    proofRequirements: ['exact-head tests'],
    outcomeSignals: ['verification-pass'],
    rollback: 'Revert the focused branch.',
  };
  const merged = { ...base, ...overrides } as Omit<V10CapabilityPlan, 'planHash'>;
  return { ...merged, planHash: v10CapabilityPlanHash(merged) };
}

describe('V10 capability kernel security boundaries', () => {
  it('accepts a correctly bound Chief AI plan', () => {
    expect(validateV10CapabilityPlan(plan())).toEqual([]);
  });

  it('detects plan tampering after hashing', () => {
    const original = plan();
    expect(validateV10CapabilityPlan({ ...original, routingReason: 'tampered' }))
      .toContain('capability plan hash does not match plan content');
  });

  it('blocks community capability authority self-escalation', () => {
    const candidate = plan({
      capabilities: [{
        id: 'external-skill',
        version: '1.0.0',
        origin: 'community',
        owner: 'external',
        sourceHash: 'd'.repeat(64),
        authorityCeiling: 'privileged',
      }],
    });
    expect(validateV10CapabilityPlan(candidate).join(' ')).toContain('authority exceeds its community origin ceiling');
  });

  it('blocks replay against a different project, goal, or exact head', () => {
    const candidate = plan();
    expect(validateV10CapabilityPlanContext(candidate, {
      goal: 'Different goal',
      projectSlug: 'other-project',
      expectedHeadSha: 'e'.repeat(40),
    })).toEqual(expect.arrayContaining([
      'capability plan goal does not match execution goal',
      'capability plan project does not match execution project',
      'capability plan head does not match execution head',
    ]));
  });
});
