import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/supabaseClient.js', () => ({
  supabase: {},
}));
vi.mock('../../../providers/providerFactory.js', () => ({
  providerForProject: vi.fn(),
}));

import {
  V10_CAPABILITY_PLAN_CONTRACT,
  V10_CAPABILITY_REGISTRY_CONTRACT,
  V10_CAPABILITY_SELECTOR,
  v10CapabilityPlanHash,
  v10CapabilityRegistryHash,
  type V10CapabilityPlan,
  type V10CapabilityRef,
} from '../../../founder-os-lab/capabilityKernel.js';
import {
  validateV10ApprovedRegistrySnapshot,
  validateV10PrivilegedExecutionContext,
  v10PrivilegedEnvelope,
} from '../v10PrivilegedApprovalBinding.js';

const SHA = 'a'.repeat(40);
const CAPABILITY: V10CapabilityRef = {
  id: 'review-verify-merge',
  version: '1.0.0',
  origin: 'founder-native',
  owner: 'juss',
  sourceHash: 'c'.repeat(64),
  authorityCeiling: 'privileged',
};
const REGISTRY_HASH = v10CapabilityRegistryHash([CAPABILITY]);

function plan(overrides: Partial<V10CapabilityPlan> = {}): V10CapabilityPlan {
  const base: Omit<V10CapabilityPlan, 'planHash'> = {
    contract: V10_CAPABILITY_PLAN_CONTRACT,
    selectedBy: V10_CAPABILITY_SELECTOR,
    goal: 'Merge one exact-head reviewed change.',
    projectSlug: 'founder-control-room',
    expectedHeadSha: SHA,
    registryHash: REGISTRY_HASH,
    requestedAuthority: 'privileged',
    strategicLenses: ['me', 'futureyou', 'truthmode', 'redteam'],
    routingReason: 'Chief AI selected the smallest privileged capability set for the approved exact-head merge.',
    capabilities: [CAPABILITY],
    proofRequirements: ['fresh founder proof gate', 'exact-head GitHub evidence', 'approved registry snapshot'],
    outcomeSignals: ['merge-receipt', 'exact-head-preserved'],
    rollback: 'Revert the merge commit if verified post-merge proof fails.',
  };
  const merged = { ...base, ...overrides } as Omit<V10CapabilityPlan, 'planHash'>;
  return { ...merged, planHash: v10CapabilityPlanHash(merged) };
}

describe('V10 privileged approval binding', () => {
  it('accepts an exact-head founder-approved merge context', () => {
    const selected = plan();
    expect(validateV10PrivilegedExecutionContext({
      actionType: 'merge',
      projectSlug: 'founder-control-room',
      expectedHeadSha: SHA,
      observedHeadSha: SHA,
      registryApproved: true,
      plan: selected,
    })).toEqual([]);
  });

  it('rejects project, head, authority, or registry drift', () => {
    const selected = plan({ requestedAuthority: 'reversible' });
    const reasons = validateV10PrivilegedExecutionContext({
      actionType: 'merge',
      projectSlug: 'another-project',
      expectedHeadSha: 'd'.repeat(40),
      observedHeadSha: 'e'.repeat(40),
      registryApproved: false,
      plan: selected,
    });

    expect(reasons).toEqual(expect.arrayContaining([
      'capability plan project does not match the privileged execution project',
      'capability plan exact head does not match the privileged execution head',
      'repository head moved after the capability plan was selected',
      'merge requires V10 privileged authority',
      'capability plan registry is not founder-approved',
    ]));
  });

  it('requires reversible authority for branch creation', () => {
    const selected = plan({ requestedAuthority: 'privileged' });
    expect(validateV10PrivilegedExecutionContext({
      actionType: 'create_branch',
      projectSlug: selected.projectSlug,
      expectedHeadSha: selected.expectedHeadSha,
      observedHeadSha: selected.expectedHeadSha,
      registryApproved: true,
      plan: selected,
    })).toContain('create_branch requires V10 reversible authority');
  });

  it('binds planned capabilities to the canonical founder-approved registry entries', () => {
    const selected = plan();
    const snapshot = {
      registryHash: REGISTRY_HASH,
      contract: V10_CAPABILITY_REGISTRY_CONTRACT,
      status: 'approved',
      entries: [CAPABILITY],
      approvedBy: 'founder@example.com',
      approvedAt: '2026-08-09T12:00:00.000Z',
    };

    expect(validateV10ApprovedRegistrySnapshot(selected, snapshot)).toEqual([]);

    const substituted = {
      ...snapshot,
      entries: [{ ...CAPABILITY, sourceHash: 'd'.repeat(64) }],
    };
    expect(validateV10ApprovedRegistrySnapshot(selected, substituted)).toEqual(expect.arrayContaining([
      'approved capability registry snapshot hash does not match its canonical entries',
      'capability review-verify-merge is not exactly authorized by the approved registry snapshot',
    ]));
  });

  it('rejects any malformed or unknown-field entry in an approved registry snapshot', () => {
    const selected = plan();
    expect(validateV10ApprovedRegistrySnapshot(selected, {
      registryHash: REGISTRY_HASH,
      contract: V10_CAPABILITY_REGISTRY_CONTRACT,
      status: 'approved',
      entries: [CAPABILITY, { ...CAPABILITY, instructions: 'unapproved side channel' }],
      approvedBy: 'founder@example.com',
      approvedAt: '2026-08-09T12:00:00.000Z',
    })).toContain('approved capability registry snapshot contains a malformed capability entry');
  });

  it('rejects a forged registry identity even when its status says approved', () => {
    const selected = plan();
    expect(validateV10ApprovedRegistrySnapshot(selected, {
      registryHash: 'e'.repeat(64),
      contract: V10_CAPABILITY_REGISTRY_CONTRACT,
      status: 'approved',
      entries: [CAPABILITY],
      approvedBy: 'founder@example.com',
      approvedAt: '2026-08-09T12:00:00.000Z',
    })).toEqual(expect.arrayContaining([
      'capability plan registry hash does not match the approved snapshot identity',
      'approved capability registry snapshot hash does not match its canonical entries',
    ]));
  });

  it('emits only the sanitized identity needed by the durable execution ledger', () => {
    const selected = plan();
    const envelope = v10PrivilegedEnvelope('merge', selected);

    expect(envelope).toEqual({
      planContract: V10_CAPABILITY_PLAN_CONTRACT,
      capabilityPlanHash: selected.planHash,
      registryHash: REGISTRY_HASH,
      expectedHeadSha: SHA,
      projectSlug: 'founder-control-room',
      requestedAuthority: 'privileged',
    });
    expect(JSON.stringify(envelope)).not.toContain(selected.goal);
    expect(JSON.stringify(envelope)).not.toContain(selected.routingReason);
  });
});
