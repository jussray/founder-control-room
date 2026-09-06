import { describe, expect, it } from 'vitest';

import {
  V10_CAPABILITY_PLAN_CONTRACT,
  V10_CAPABILITY_SELECTOR,
  v10CapabilityPlanHash,
  type V10CapabilityPlan,
} from '../../founder-os-lab/capabilityKernel.js';
import {
  FCR_HUMANIZER_CAPABILITY,
  FCR_REQUIRED_PARALLEL_LENSES,
  routeFcrSkills,
} from '../fcrSkillRouter.js';

const HEAD = 'a'.repeat(40);
const REGISTRY_HASH = 'b'.repeat(64);

function humanizerCapability(overrides: Partial<V10CapabilityPlan['capabilities'][number]> = {}): V10CapabilityPlan['capabilities'][number] {
  return { ...FCR_HUMANIZER_CAPABILITY, ...overrides };
}

function plan(goal: string, capabilities: V10CapabilityPlan['capabilities']): V10CapabilityPlan {
  const base: Omit<V10CapabilityPlan, 'planHash'> = {
    contract: V10_CAPABILITY_PLAN_CONTRACT,
    selectedBy: V10_CAPABILITY_SELECTOR,
    goal,
    projectSlug: 'founder-control-room',
    expectedHeadSha: HEAD,
    registryHash: REGISTRY_HASH,
    requestedAuthority: 'draft',
    strategicLenses: ['futureyou', 'truthmode', 'redteam', ...FCR_REQUIRED_PARALLEL_LENSES],
    routingReason: 'PromptOS selected Humanizer and Chief supplied the hash-bound capability plan.',
    capabilities,
    proofRequirements: ['claim preservation', 'donor provenance'],
    outcomeSignals: ['humanized prose'],
    rollback: 'Disable the Humanizer route.',
  };
  return { ...base, planHash: v10CapabilityPlanHash(base) };
}

function route(goal: string, capabilities: V10CapabilityPlan['capabilities']) {
  return routeFcrSkills({
    goal,
    action: 'draft',
    projectSlug: 'founder-control-room',
    expectedHeadSha: HEAD,
    expectedRegistryHash: REGISTRY_HASH,
    capabilityPlan: plan(goal, capabilities),
  });
}

describe('FCR Humanizer donor governance', () => {
  it('requires Humanizer when the trusted goal explicitly asks for it', () => {
    const decision = route('Humanize this draft and match my voice.', []);

    expect(decision.policyRequiredCapabilityIds).toContain('humanizer');
    expect(decision.missingPolicyCapabilityIds).toContain('humanizer');
    expect(decision.status).toBe('blocked');
  });

  it('accepts only the founder-approved Blader capability identity', () => {
    const decision = route('Humanize this draft.', [humanizerCapability()]);

    expect(decision.status).toBe('ready_for_runtime_discovery');
    expect(decision.executionAllowed).toBe(false);
    expect(decision.requiredProof).toContain('Humanizer capability provenance matches .control-room/humanizer-donor.contract.json');
    expect(decision.requiredProof.join(' ')).toMatch(/preserves claims without unsupported facts/);
  });

  it('fails closed when a plan substitutes a different Humanizer source', () => {
    const decision = route('Humanize this draft.', [humanizerCapability({ sourceHash: 'd'.repeat(64) })]);

    expect(decision.status).toBe('blocked');
    expect(decision.errors).toContain('Chief AI humanizer capability does not match the founder-approved Blader donor pin');
  });

  it('keeps the approved community donor at draft authority', () => {
    expect(FCR_HUMANIZER_CAPABILITY).toEqual({
      id: 'humanizer',
      version: '2.11.2',
      origin: 'community',
      owner: 'blader/humanizer',
      sourceHash: 'e86e6c4897212837d0a2a9b966e50e2839eefc0358c5e110e48d494bf3d25186',
      authorityCeiling: 'draft',
    });
  });
});
