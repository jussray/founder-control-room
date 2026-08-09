import { describe, expect, it } from 'vitest';
import {
  V10_CAPABILITY_PLAN_CONTRACT,
  V10_CAPABILITY_SELECTOR,
  v10CapabilityPlanHash,
  type V10CapabilityPlan,
} from '../../founder-os-lab/capabilityKernel.js';
import {
  acceptN8nConveyorRuntimeInput,
  validateN8nConveyorRuntimeInput,
  type N8nConveyorRuntimeInput,
} from '../n8nConveyorRuntime.js';
import {
  expectedFounderConveyorReceiptId,
  founderConveyorIdempotencyKey,
} from '../n8nConveyor.js';

const SHA = 'a'.repeat(40);
const REGISTRY_HASH = 'b'.repeat(64);

function capabilityPlan(overrides: Partial<V10CapabilityPlan> = {}): V10CapabilityPlan {
  const base: Omit<V10CapabilityPlan, 'planHash'> = {
    contract: V10_CAPABILITY_PLAN_CONTRACT,
    selectedBy: V10_CAPABILITY_SELECTOR,
    goal: 'Move one verified increment through the conveyor.',
    projectSlug: 'founder-control-room',
    expectedHeadSha: SHA,
    registryHash: REGISTRY_HASH,
    requestedAuthority: 'draft',
    strategicLenses: ['me', 'futureyou', 'truthmode'],
    routingReason: 'Chief AI selected the smallest evidence-bound build capability.',
    capabilities: [{
      id: 'goalfix',
      version: '1.0.0',
      origin: 'founder-native',
      owner: 'juss',
      sourceHash: 'c'.repeat(64),
      authorityCeiling: 'privileged',
    }],
    proofRequirements: ['focused tests', 'exact-head evidence'],
    outcomeSignals: ['verification-pass', 'founder-override-rate'],
    rollback: 'Revert the focused change.',
  };
  const merged = { ...base, ...overrides } as Omit<V10CapabilityPlan, 'planHash'>;
  return { ...merged, planHash: v10CapabilityPlanHash(merged) };
}

function candidate(overrides: Partial<N8nConveyorRuntimeInput> = {}): N8nConveyorRuntimeInput {
  const plan = overrides.capabilityPlan ?? capabilityPlan({
    goal: overrides.goal ?? 'Move one verified increment through the conveyor.',
    projectSlug: overrides.projectSlug ?? 'founder-control-room',
    expectedHeadSha: overrides.expectedHeadSha ?? SHA,
  });
  const input: N8nConveyorRuntimeInput = {
    contract: 'founder-control-room/n8n-conveyor@v3',
    event: 'conveyor.stage.advance',
    idempotencyKey: '',
    runId: 'run-123',
    projectSlug: 'founder-control-room',
    goal: 'Move one verified increment through the conveyor.',
    fromStage: 'workflows',
    toStage: 'code',
    expectedHeadSha: SHA,
    capabilityPlan: plan,
    evidenceUrls: [],
    authority: {
      advanceStage: true,
      merge: false,
      deploy: false,
      publish: false,
      sendExternal: false,
    },
    ...overrides,
  };

  if (!overrides.idempotencyKey) {
    input.idempotencyKey = founderConveyorIdempotencyKey(input);
  }

  return input;
}

describe('n8n conveyor runtime', () => {
  it('accepts a Chief-AI-selected capability plan and returns a deterministic canonical v3 receipt', () => {
    const input = candidate();
    const first = acceptN8nConveyorRuntimeInput(input);
    const retry = acceptN8nConveyorRuntimeInput(input);

    expect(first.ok).toBe(true);
    expect(first.receipt?.receiptId).toMatch(/^fcr-conveyor-receipt-v3:[0-9a-f]{64}$/);
    expect(retry.receipt?.receiptId).toBe(first.receipt?.receiptId);
    expect(first.receipt?.receiptId).toBe(expectedFounderConveyorReceiptId(input));
    expect(first.receipt?.skillIds).toEqual(['goalfix']);
    expect(first.receipt?.capabilityPlanHash).toBe(input.capabilityPlan.planHash);
    expect(first.receipt?.registryHash).toBe(REGISTRY_HASH);
    expect(first.receipt?.outcomeSignals).toContain('verification-pass');
  });

  it('refuses authority expansion', () => {
    const errors = validateN8nConveyorRuntimeInput(candidate({
      authority: {
        advanceStage: true,
        merge: true,
        deploy: false,
        publish: false,
        sendExternal: false,
      },
    }));

    expect(errors).toContain('authority envelope is broader than conveyor policy');
  });

  it('requires proof on verified state transitions', () => {
    expect(validateN8nConveyorRuntimeInput(candidate({
      fromStage: 'code',
      toStage: 'projects',
      evidenceUrls: [],
    }))).toContain('evidence is required for code -> projects');
  });

  it('rejects a capability plan selected by n8n or bound to different reality', () => {
    const selectedByN8n = capabilityPlan();
    const spoofed = {
      ...selectedByN8n,
      selectedBy: 'n8n',
    } as unknown as V10CapabilityPlan;

    expect(validateN8nConveyorRuntimeInput(candidate({ capabilityPlan: spoofed })))
      .toContain('capability selection must be owned by Chief AI Machine');

    const wrongHeadPlan = capabilityPlan({ expectedHeadSha: 'd'.repeat(40) });
    expect(validateN8nConveyorRuntimeInput(candidate({ capabilityPlan: wrongHeadPlan })))
      .toContain('capability plan head does not match execution head');
  });

  it('binds idempotency and receipt identity to the capability plan', () => {
    const firstInput = candidate();
    const secondPlan = capabilityPlan({
      capabilities: [{
        id: 'repo-truth',
        version: '1.0.0',
        origin: 'repo-native',
        owner: 'chief-ai-machine',
        sourceHash: 'd'.repeat(64),
        authorityCeiling: 'privileged',
      }],
    });
    const secondInput = candidate({ capabilityPlan: secondPlan });

    expect(founderConveyorIdempotencyKey(secondInput)).not.toBe(founderConveyorIdempotencyKey(firstInput));
    expect(acceptN8nConveyorRuntimeInput(secondInput).receipt?.receiptId)
      .not.toBe(acceptN8nConveyorRuntimeInput(firstInput).receipt?.receiptId);
  });

  it('does not let stage advancement smuggle privileged execution authority', () => {
    const privileged = capabilityPlan({ requestedAuthority: 'privileged' });
    expect(validateN8nConveyorRuntimeInput(candidate({ capabilityPlan: privileged })))
      .toContain('conveyor stage advancement cannot carry reversible or privileged execution authority');
  });
});
