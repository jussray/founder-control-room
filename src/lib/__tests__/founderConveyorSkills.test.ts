import { describe, expect, it } from 'vitest';
import {
  V10_CAPABILITY_PLAN_CONTRACT,
  V10_CAPABILITY_SELECTOR,
  v10CapabilityPlanHash,
  type V10CapabilityPlan,
} from '../../founder-os-lab/capabilityKernel.js';
import {
  founderConveyorSkillsFromPlan,
  validateFounderConveyorCapabilityPlan,
} from '../founderConveyorSkills.js';

const SHA = 'a'.repeat(40);

function plan(capabilityIds: string[] = ['goalfix']): V10CapabilityPlan {
  const base: Omit<V10CapabilityPlan, 'planHash'> = {
    contract: V10_CAPABILITY_PLAN_CONTRACT,
    selectedBy: V10_CAPABILITY_SELECTOR,
    goal: 'Route capabilities from Chief AI, not conveyor stage.',
    projectSlug: 'founder-control-room',
    expectedHeadSha: SHA,
    registryHash: 'b'.repeat(64),
    requestedAuthority: 'draft',
    strategicLenses: ['truthmode'],
    routingReason: 'Use only the capabilities selected by Chief AI.',
    capabilities: capabilityIds.map((id, index) => ({
      id,
      version: '1.0.0',
      origin: 'founder-native',
      owner: 'juss',
      sourceHash: (index % 2 === 0 ? 'c' : 'd').repeat(64),
      authorityCeiling: 'privileged',
    })),
    proofRequirements: ['exact-head evidence'],
    outcomeSignals: ['verification-pass'],
    rollback: 'Discard the preview.',
  };
  return { ...base, planHash: v10CapabilityPlanHash(base) };
}

describe('founder conveyor V10 capability routing', () => {
  it('derives only the capability IDs declared by Chief AI', () => {
    expect(founderConveyorSkillsFromPlan(plan(['goalfix', 'repo-truth']))).toEqual([
      'goalfix',
      'repo-truth',
    ]);
  });

  it('does not infer different skills from chat, code, or any conveyor stage', () => {
    const selected = founderConveyorSkillsFromPlan(plan(['proof-led-publishing']));
    expect(selected).toEqual(['proof-led-publishing']);
  });

  it('validates the plan against the exact execution goal, project, and head', () => {
    const candidate = plan();
    expect(validateFounderConveyorCapabilityPlan(candidate, {
      goal: candidate.goal,
      projectSlug: candidate.projectSlug,
      expectedHeadSha: candidate.expectedHeadSha,
    })).toEqual([]);
  });

  it('rejects plan replay against a different execution head', () => {
    const candidate = plan();
    expect(validateFounderConveyorCapabilityPlan(candidate, {
      goal: candidate.goal,
      projectSlug: candidate.projectSlug,
      expectedHeadSha: 'e'.repeat(40),
    })).toContain('capability plan head does not match execution head');
  });
});
