import { describe, expect, it } from 'vitest';
import {
  V10_CAPABILITY_PLAN_CONTRACT,
  V10_CAPABILITY_SELECTOR,
  v10CapabilityPlanHash,
  type V10CapabilityPlan,
} from '../capabilityKernel.js';
import { planFounderOsLab } from '../engine.js';

const SHA = 'a'.repeat(40);
const PROOF_URL = `https://github.com/jussray/founder-control-room/commit/${SHA}`;

function capabilityPlan(): V10CapabilityPlan {
  const base: Omit<V10CapabilityPlan, 'planHash'> = {
    contract: V10_CAPABILITY_PLAN_CONTRACT,
    selectedBy: V10_CAPABILITY_SELECTOR,
    goal: 'Preview exact-head merge readiness.',
    projectSlug: 'founder-control-room',
    expectedHeadSha: SHA,
    registryHash: 'b'.repeat(64),
    requestedAuthority: 'draft',
    strategicLenses: ['truthmode', 'redteam'],
    routingReason: 'Use the merge-verification capability only.',
    capabilities: [{
      id: 'review-verify-merge',
      version: '1.0.0',
      origin: 'founder-native',
      owner: 'juss',
      sourceHash: 'c'.repeat(64),
      authorityCeiling: 'privileged',
    }],
    proofRequirements: ['exact-head checks'],
    outcomeSignals: ['merge-readiness-verified'],
    rollback: 'Discard the preview.',
  };
  return { ...base, planHash: v10CapabilityPlanHash(base) };
}

describe('V10 approval binding', () => {
  it('accepts approval only when action, project, head, and plan hash all match', () => {
    const cp = capabilityPlan();
    const plan = planFounderOsLab({
      goal: cp.goal,
      action: 'merge-code',
      capabilityPlan: cp,
      approval: {
        id: 'approval-1',
        actions: ['merge-code'],
        projectSlug: cp.projectSlug,
        expectedHeadSha: cp.expectedHeadSha,
        capabilityPlanHash: cp.planHash,
      },
      evidence: {
        repository: 'jussray/founder-control-room',
        commitSha: SHA,
        proofUrls: [PROOF_URL],
      },
    });

    expect(plan.authority.approvalObserved).toBe(true);
    expect(plan.readiness).toBe('ready_for_external_executor');
  });

  it('rejects approval replay against a different capability plan hash', () => {
    const cp = capabilityPlan();
    const plan = planFounderOsLab({
      goal: cp.goal,
      action: 'merge-code',
      capabilityPlan: cp,
      approval: {
        id: 'approval-1',
        actions: ['merge-code'],
        projectSlug: cp.projectSlug,
        expectedHeadSha: cp.expectedHeadSha,
        capabilityPlanHash: 'd'.repeat(64),
      },
      evidence: {
        repository: 'jussray/founder-control-room',
        commitSha: SHA,
        proofUrls: [PROOF_URL],
      },
    });

    expect(plan.authority.approvalObserved).toBe(false);
    expect(plan.readiness).toBe('approval_required');
  });
});
