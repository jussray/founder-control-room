import { describe, expect, it } from 'vitest';

import {
  V10_CAPABILITY_PLAN_CONTRACT,
  V10_CAPABILITY_SELECTOR,
  v10CapabilityPlanHash,
  type V10CapabilityPlan,
} from '../../founder-os-lab/capabilityKernel.js';
import {
  FCR_REQUIRED_PARALLEL_LENSES,
  FCR_SKILL_ROUTER_CONTRACT,
  routeFcrSkills,
  type FcrSkillRouterAction,
} from '../fcrSkillRouter.js';

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

function plan(goal: string, capabilityIds: string[], overrides: Partial<V10CapabilityPlan> = {}): V10CapabilityPlan {
  const base: Omit<V10CapabilityPlan, 'planHash'> = {
    contract: V10_CAPABILITY_PLAN_CONTRACT,
    selectedBy: V10_CAPABILITY_SELECTOR,
    goal,
    projectSlug: 'founder-control-room',
    expectedHeadSha: HEAD,
    registryHash: REGISTRY_HASH,
    requestedAuthority: 'draft',
    strategicLenses: ['futureyou', 'truthmode', 'redteam', ...FCR_REQUIRED_PARALLEL_LENSES],
    routingReason: 'Chief AI selected the smallest bounded capability plan.',
    capabilities: capabilityIds.map(capability),
    proofRequirements: ['exact-head evidence'],
    outcomeSignals: ['verification-pass'],
    rollback: 'Revert the focused change.',
  };
  const merged = { ...base, ...overrides } as Omit<V10CapabilityPlan, 'planHash'>;
  return { ...merged, planHash: v10CapabilityPlanHash(merged) };
}

function route(goal: string, action: FcrSkillRouterAction, capabilityIds: string[], extras: Partial<Parameters<typeof routeFcrSkills>[0]> = {}) {
  return routeFcrSkills({
    goal,
    action,
    projectSlug: 'founder-control-room',
    expectedHeadSha: HEAD,
    expectedRegistryHash: REGISTRY_HASH,
    capabilityPlan: plan(goal, capabilityIds),
    ...extras,
  });
}

describe('FCR skill router trust gate', () => {
  it('fails closed until Chief AI supplies a hash-bound capability plan', () => {
    const decision = routeFcrSkills({
      goal: 'Repair the repository.',
      action: 'write',
      projectSlug: 'founder-control-room',
      expectedHeadSha: HEAD,
      expectedRegistryHash: REGISTRY_HASH,
      repository: { projectId: 'founder-control-room', provider: 'github' },
    });

    expect(decision.contract).toBe(FCR_SKILL_ROUTER_CONTRACT);
    expect(decision.status).toBe('blocked');
    expect(decision.plannedCapabilityIds).toEqual([]);
    expect(decision.requiredParallelLenses).toEqual([...FCR_REQUIRED_PARALLEL_LENSES]);
    expect(decision.missingParallelLenses).toEqual([...FCR_REQUIRED_PARALLEL_LENSES]);
    expect(decision.errors).toContain('Chief AI capability plan is required before FCR may accept a skill route');
    expect(decision.executionAllowed).toBe(false);
  });

  it('requires Product Design, Data Analytics, and Deep Research on every routed plan', () => {
    const goal = 'Plan the next smallest build.';
    const decision = routeFcrSkills({
      goal,
      action: 'plan',
      projectSlug: 'founder-control-room',
      expectedHeadSha: HEAD,
      expectedRegistryHash: REGISTRY_HASH,
      capabilityPlan: plan(goal, ['juss-chief-ai'], { strategicLenses: ['futureyou', 'truthmode', 'redteam'] }),
    });

    expect(decision.status).toBe('blocked');
    expect(decision.requiredParallelLenses).toEqual(['product-design', 'data-analytics', 'deep-research']);
    expect(decision.missingParallelLenses).toEqual(['product-design', 'data-analytics', 'deep-research']);
    expect(decision.errors).toEqual(expect.arrayContaining([
      'Chief AI capability plan is missing required RayOS parallel lens: product-design',
      'Chief AI capability plan is missing required RayOS parallel lens: data-analytics',
      'Chief AI capability plan is missing required RayOS parallel lens: deep-research',
    ]));
  });

  it('accepts Chief AI capability selection without reconstructing the stack from prompt keywords', () => {
    const goal = 'Audit the repository and prepare the smallest safe repair.';
    const decision = route(goal, 'write', ['goalfix', 'repo-truth'], {
      repository: { projectId: 'founder-control-room', provider: 'forgejo' },
    });

    expect(decision.status).toBe('ready_for_runtime_discovery');
    expect(decision.plannedCapabilityIds).toEqual(['goalfix', 'repo-truth']);
    expect(decision.missingParallelLenses).toEqual([]);
    expect(decision.requiredTools).toContain('forgejo');
    expect(decision.requiredTools).not.toContain('github');
    expect(decision.requiredProof).toContain('repository evidence resolved through RepositoryProvider:forgejo');
    expect(decision.requiredProof.join(' ')).toMatch(/Product Design/);
    expect(decision.requiredProof.join(' ')).toMatch(/Data Analytics/);
    expect(decision.requiredProof.join(' ')).toMatch(/Deep Research/);
    expect(decision.runtimeDiscoveryRequired).toBe(true);
  });

  it('rejects a plan bound to the wrong capability registry', () => {
    const goal = 'Plan the next move.';
    const decision = routeFcrSkills({
      goal,
      action: 'plan',
      projectSlug: 'founder-control-room',
      expectedHeadSha: HEAD,
      expectedRegistryHash: 'd'.repeat(64),
      capabilityPlan: plan(goal, ['juss-chief-ai']),
    });

    expect(decision.status).toBe('blocked');
    expect(decision.errors).toContain('capability plan registry hash does not match the authoritative registry');
  });

  it('preserves explicit /sales /devil requirements and blocks an incomplete commercial plan', () => {
    const goal = '/sales /devil construct the strongest truthful offer.';
    const incomplete = route(goal, 'draft', ['sales']);

    expect(incomplete.policyRequiredCapabilityIds).toEqual(expect.arrayContaining(['sales', 'devil']));
    expect(incomplete.missingPolicyCapabilityIds).toContain('devil');
    expect(incomplete.status).toBe('blocked');

    const complete = route(goal, 'draft', ['sales', 'devil']);
    expect(complete.status).toBe('ready_for_runtime_discovery');
  });

  it('routes messaging through the unified-growth-inbox policy gate without authorizing send', () => {
    const goal = 'Draft an email reply for this lead.';
    const blocked = route(goal, 'draft', ['juss-chief-ai']);

    expect(blocked.policyRequiredCapabilityIds).toContain('unified-growth-inbox');
    expect(blocked.status).toBe('blocked');

    const ready = route(goal, 'draft', ['unified-growth-inbox']);
    expect(ready.status).toBe('ready_for_runtime_discovery');
    expect(ready.requiredProof.join(' ')).toMatch(/draft_only/);
    expect(ready.executionAllowed).toBe(false);
  });

  it.each(['migrate', 'rollback'] as const)('classifies %s as a privileged mutation action', (action) => {
    const goal = action === 'migrate' ? 'Migrate the Supabase schema.' : 'Roll back the deployment.';
    const decision = route(goal, action, ['goalfix']);

    expect(decision.mutationRequested).toBe(true);
    expect(decision.requiredProof).toContain('action-specific authority, approval, rollback, and execution receipt');
    expect(decision.executionAllowed).toBe(false);
  });

  it('does not add merge-review gates to ordinary UI review language', () => {
    const goal = 'Review the mobile UI in Playwright.';
    const decision = route(goal, 'review', ['control-room-design-implementation']);

    expect(decision.status).toBe('ready_for_runtime_discovery');
    expect(decision.requiredTools).toContain('playwright');
    expect(decision.requiredProof).toContain('exact-head Playwright evidence for UI/runtime claims');
    expect(decision.requiredProof).not.toContain('exact-head checks and unresolved review-thread state');
  });

  it('adds merge-review proof only when repository context and merge/review action are both present', () => {
    const goal = 'Review this pull request before merge.';
    const decision = route(goal, 'review', ['review-verify-merge'], {
      repository: { projectId: 'founder-control-room', provider: 'github' },
    });

    expect(decision.requiredProof).toContain('exact-head checks and unresolved review-thread state');
    expect(decision.requiredTools).toContain('github');
  });

  it('requires explicitly named skills to be present in the Chief AI plan', () => {
    const goal = '/goalfix repair this regression.';
    const decision = route(goal, 'write', ['juss-chief-ai']);

    expect(decision.policyRequiredCapabilityIds).toContain('goalfix');
    expect(decision.missingPolicyCapabilityIds).toContain('goalfix');
    expect(decision.status).toBe('blocked');
  });
});
