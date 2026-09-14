import { describe, expect, it } from 'vitest';

import {
  V10_CAPABILITY_PLAN_CONTRACT,
  V10_CAPABILITY_SELECTOR,
  v10CapabilityPlanHash,
  type V10CapabilityPlan,
} from '../capabilityKernel.js';
import { FCR_AUTOMATIC_COUNCIL_LENSES } from '../../lib/fcrSkillRouter.js';
import {
  effectiveFounderCouncilLenses,
  runFounderOsSandbox,
} from '../sandbox.js';

const HEAD = 'a'.repeat(40);
const REGISTRY_HASH = 'b'.repeat(64);

function plan(goal: string): V10CapabilityPlan {
  const base: Omit<V10CapabilityPlan, 'planHash'> = {
    contract: V10_CAPABILITY_PLAN_CONTRACT,
    selectedBy: V10_CAPABILITY_SELECTOR,
    goal,
    projectSlug: 'founder-control-room',
    expectedHeadSha: HEAD,
    registryHash: REGISTRY_HASH,
    requestedAuthority: 'reason',
    strategicLenses: ['truthmode', 'custom-task-lens'],
    routingReason: 'Chief selects the bounded capability; FCR owns the automatic advisory council.',
    capabilities: [{
      id: 'goalfix',
      version: '1.0.0',
      origin: 'founder-native',
      owner: 'juss',
      sourceHash: 'c'.repeat(64),
      authorityCeiling: 'privileged',
    }],
    proofRequirements: ['exact-head evidence'],
    outcomeSignals: ['verification-pass'],
    rollback: 'Discard the isolated preview.',
  };
  return { ...base, planHash: v10CapabilityPlanHash(base) };
}

describe('automatic Founder Council runtime overlay', () => {
  it('applies the full council without slash commands or a Chief plan', () => {
    const run = runFounderOsSandbox({
      goal: 'Inspect current project truth and identify the smallest safe next move.',
      action: 'inspect',
    });

    expect(run.status).toBe('simulated');
    expect(run.plan).not.toBeNull();
    expect(run.plan?.route.capabilityPlan.observed).toBe(false);
    expect(run.plan?.route.capabilityPlan.strategicLenses).toEqual([
      ...FCR_AUTOMATIC_COUNCIL_LENSES,
    ]);
    expect(run.plan?.authority.executionAllowed).toBe(false);
    expect(run.plan?.truth.verified.join(' ')).toContain(
      'slash commands are optional foreground aliases',
    );
  });

  it('layers task-specific lenses onto the code-owned council without rewriting the hash-bound Chief plan', () => {
    const goal = 'Inspect current project truth with one task-specific lens.';
    const capabilityPlan = plan(goal);
    const originalHash = capabilityPlan.planHash;
    const originalStrategicLenses = [...capabilityPlan.strategicLenses];

    const run = runFounderOsSandbox({
      goal,
      action: 'inspect',
      capabilityPlan,
    });

    expect(run.status).toBe('simulated');
    expect(run.plan).not.toBeNull();
    expect(run.plan?.route.capabilityPlan.valid).toBe(true);
    expect(run.plan?.route.capabilityPlan.planHash).toBe(originalHash);
    expect(run.plan?.route.capabilityPlan.strategicLenses).toEqual(
      effectiveFounderCouncilLenses(originalStrategicLenses),
    );
    expect(run.plan?.route.capabilityPlan.strategicLenses).toContain('custom-task-lens');
    expect(capabilityPlan.planHash).toBe(originalHash);
    expect(capabilityPlan.strategicLenses).toEqual(originalStrategicLenses);
    expect(run.plan?.authority.executionAllowed).toBe(false);
  });

  it('deduplicates aliases case-insensitively while preserving canonical council order', () => {
    expect(effectiveFounderCouncilLenses([
      ' TRUTHMODE ',
      'custom-task-lens',
      'Custom-Task-Lens',
      '  ',
    ])).toEqual([
      ...FCR_AUTOMATIC_COUNCIL_LENSES,
      'custom-task-lens',
    ]);
  });
});
