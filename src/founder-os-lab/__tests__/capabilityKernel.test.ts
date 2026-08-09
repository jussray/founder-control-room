import { describe, expect, it } from 'vitest';
import {
  V10_CAPABILITY_PLAN_CONTRACT,
  V10_CAPABILITY_SELECTOR,
  isV10CapabilityPlan,
  validateV10CapabilityPlan,
  validateV10CapabilityPlanContext,
  v10CapabilityPlanHash,
  type V10CapabilityPlan,
} from '../capabilityKernel.js';

const SHA = 'a'.repeat(40);
const CONFORMANCE_HASH = '7a2f344b9086b8a5a86ece6f027ad727bd76c2ac8a1e0efe2fb41133727c153d';

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
  it('matches the shared Chief/FCR/n8n capability-plan conformance hash', () => {
    const fixture: Omit<V10CapabilityPlan, 'planHash'> = {
      contract: V10_CAPABILITY_PLAN_CONTRACT,
      selectedBy: V10_CAPABILITY_SELECTOR,
      goal: 'Conformance fixture.',
      projectSlug: 'founder-control-room',
      expectedHeadSha: 'a'.repeat(40),
      registryHash: 'b'.repeat(64),
      requestedAuthority: 'draft',
      strategicLenses: ['futureyou', 'truthmode'],
      routingReason: 'Verify cross-runtime capability-plan hashing.',
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
      rollback: 'Discard fixture.',
    };

    expect(v10CapabilityPlanHash(fixture)).toBe(CONFORMANCE_HASH);
  });

  it('accepts a correctly bound Chief AI plan', () => {
    expect(isV10CapabilityPlan(plan())).toBe(true);
    expect(validateV10CapabilityPlan(plan())).toEqual([]);
  });

  it('fails closed on object-shaped malformed plans without throwing', () => {
    const malformed = {
      contract: V10_CAPABILITY_PLAN_CONTRACT,
      selectedBy: V10_CAPABILITY_SELECTOR,
      goal: 'Malformed plan.',
      projectSlug: 'founder-control-room',
      expectedHeadSha: SHA,
      registryHash: 'b'.repeat(64),
      requestedAuthority: 'draft',
      strategicLenses: null,
      routingReason: 'Malformed on purpose.',
      capabilities: [null],
      proofRequirements: ['proof'],
      outcomeSignals: ['signal'],
      rollback: 'Discard.',
      planHash: 'c'.repeat(64),
    };
    expect(isV10CapabilityPlan(malformed)).toBe(false);
    expect(() => validateV10CapabilityPlan(malformed as unknown as V10CapabilityPlan)).not.toThrow();
    expect(validateV10CapabilityPlan(malformed as unknown as V10CapabilityPlan)).toContain('capability plan shape is invalid');
    expect(validateV10CapabilityPlanContext(malformed as unknown as V10CapabilityPlan, {
      goal: 'Malformed plan.',
      projectSlug: 'founder-control-room',
      expectedHeadSha: SHA,
    })).toContain('capability plan shape is invalid');
  });

  it('rejects unhashed extra fields on plans and nested capability refs', () => {
    const canonical = plan();
    const extraPlanField = { ...canonical, privatePayload: 'must-not-cross-boundary' };
    expect(isV10CapabilityPlan(extraPlanField)).toBe(false);
    expect(validateV10CapabilityPlan(extraPlanField as unknown as V10CapabilityPlan))
      .toContain('capability plan shape is invalid');

    const extraCapabilityField = {
      ...canonical,
      capabilities: [{ ...canonical.capabilities[0]!, providerPayload: 'unhashed' }],
    };
    expect(isV10CapabilityPlan(extraCapabilityField)).toBe(false);
    expect(validateV10CapabilityPlan(extraCapabilityField as unknown as V10CapabilityPlan))
      .toContain('capability plan shape is invalid');
  });

  it('rejects whitespace-only strategic, proof, and outcome entries', () => {
    for (const overrides of [
      { strategicLenses: [' '] },
      { proofRequirements: [' '] },
      { outcomeSignals: [' '] },
    ] satisfies Array<Partial<V10CapabilityPlan>>) {
      const candidate = plan(overrides);
      expect(validateV10CapabilityPlan(candidate).length).toBeGreaterThan(0);
    }
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
