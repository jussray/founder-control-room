import { describe, expect, it } from 'vitest';
import {
  acceptN8nConveyorRuntimeInput,
  validateN8nConveyorRuntimeInput,
  type N8nConveyorRuntimeInput,
} from '../n8nConveyorRuntime.js';

const SHA = 'a'.repeat(40);
const KEY = `fcr-conveyor-v1:${'b'.repeat(64)}`;

function candidate(overrides: Partial<N8nConveyorRuntimeInput> = {}): N8nConveyorRuntimeInput {
  return {
    contract: 'founder-control-room/n8n-conveyor@v1',
    event: 'conveyor.stage.advance',
    idempotencyKey: KEY,
    runId: 'run-123',
    projectSlug: 'founder-control-room',
    goal: 'Move one verified increment through the conveyor.',
    fromStage: 'workflows',
    toStage: 'code',
    expectedHeadSha: SHA,
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
}

describe('n8n conveyor runtime', () => {
  it('accepts a bounded transition and returns a deterministic receipt', () => {
    const first = acceptN8nConveyorRuntimeInput(candidate());
    const retry = acceptN8nConveyorRuntimeInput(candidate());

    expect(first.ok).toBe(true);
    expect(first.receipt?.receiptId).toMatch(/^n8n-fcr-v1:[0-9a-f]{64}$/);
    expect(retry.receipt?.receiptId).toBe(first.receipt?.receiptId);
    expect(first.receipt?.skillIds).toEqual([
      'lean-build-orchestrator',
      'regression-stagnation-guard',
      'capability-mode-router',
    ]);
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

  it('binds the receipt to the exact Git head', () => {
    const first = acceptN8nConveyorRuntimeInput(candidate()).receipt?.receiptId;
    const second = acceptN8nConveyorRuntimeInput(candidate({ expectedHeadSha: 'c'.repeat(40) })).receipt?.receiptId;
    expect(second).not.toBe(first);
  });

  it('routes truth research into the reusable skills stage', () => {
    const result = acceptN8nConveyorRuntimeInput(candidate({
      fromStage: 'projects',
      toStage: 'skills',
      evidenceUrls: ['https://github.com/jussray/founder-control-room/commit/'.concat(SHA)],
    }));

    expect(result.receipt?.skillIds).toContain('truth-research-optimizer');
  });
});
