import { describe, expect, it } from 'vitest';

import {
  V10_CAPABILITY_PLAN_CONTRACT,
  V10_CAPABILITY_SELECTOR,
  v10CapabilityPlanHash,
  type V10CapabilityPlan,
} from '../../founder-os-lab/capabilityKernel.js';
import { FCR_REQUIRED_PARALLEL_LENSES } from '../fcrSkillRouter.js';
import {
  FCR_STORYENGINE_CREATIVE_ROUTER_CONTRACT,
  routeStoryEngineCreativeWork,
} from '../storyEngineCreativeRouter.js';

const HEAD = 'a'.repeat(40);
const REGISTRY_HASH = 'b'.repeat(64);

function capability(id: string): V10CapabilityPlan['capabilities'][number] {
  return {
    id,
    version: '1.0.0',
    origin: 'founder-native',
    owner: 'juss',
    sourceHash: 'c'.repeat(64),
    authorityCeiling: 'privileged',
  };
}

function plan(goal: string, capabilityIds: string[]): V10CapabilityPlan {
  const base: Omit<V10CapabilityPlan, 'planHash'> = {
    contract: V10_CAPABILITY_PLAN_CONTRACT,
    selectedBy: V10_CAPABILITY_SELECTOR,
    goal,
    projectSlug: 'StoryEngine',
    expectedHeadSha: HEAD,
    registryHash: REGISTRY_HASH,
    requestedAuthority: 'draft',
    strategicLenses: ['truthmode', ...FCR_REQUIRED_PARALLEL_LENSES],
    routingReason: 'Chief AI selected the smallest bounded StoryEngine capability plan.',
    capabilities: capabilityIds.map(capability),
    proofRequirements: ['exact-head evidence'],
    outcomeSignals: ['creator-ruling-preserved'],
    rollback: 'Revert the focused creative-routing change.',
  };
  return { ...base, planHash: v10CapabilityPlanHash(base) };
}

describe('StoryEngine creative routing through FCR', () => {
  it('blocks when the three-council Court is requested without the Devil capability', () => {
    const goal = 'Imagine this StoryEngine world and write the opening scene.';
    const decision = routeStoryEngineCreativeWork({
      goal,
      action: 'draft',
      projectSlug: 'StoryEngine',
      expectedHeadSha: HEAD,
      expectedRegistryHash: REGISTRY_HASH,
      capabilityPlan: plan(goal, ['juss-chief-ai']),
    });

    expect(decision.contract).toBe(FCR_STORYENGINE_CREATIVE_ROUTER_CONTRACT);
    expect(decision.court.applies).toBe(true);
    expect(decision.court.councils.map((council) => council.id)).toEqual(['writers', 'ai', 'production']);
    expect(decision.status).toBe('blocked');
    expect(decision.errors).toContain('StoryEngine Court requires Chief AI capability plan to include: devil');
    expect(decision.executionAllowed).toBe(false);
  });

  it('is eligible for runtime discovery when the FCR plan includes Devil and keeps creator freedom non-authorizing', () => {
    const goal = '/devil /MAKEVIDEO turn this StoryEngine scene into a cinematic sequence.';
    const decision = routeStoryEngineCreativeWork({
      goal,
      action: 'draft',
      projectSlug: 'StoryEngine',
      expectedHeadSha: HEAD,
      expectedRegistryHash: REGISTRY_HASH,
      capabilityPlan: plan(goal, ['devil']),
    });

    expect(decision.status).toBe('ready_for_runtime_discovery');
    expect(decision.court.phase).toBe('video');
    expect(decision.court.devilCrossExaminationRequired).toBe(true);
    expect(decision.court.creatorFinalAuthority).toBe(true);
    expect(decision.court.userFreedom.freeTextEscapeHatchRequired).toBe(true);
    expect(decision.requiredProof.join(' ')).toMatch(/creator remains final authority/i);
    expect(decision.requiredProof.join(' ')).toMatch(/live only with verified connector\/API\/runtime evidence/i);
    expect(decision.executionAllowed).toBe(false);
  });
});
