import { describe, expect, it, vi } from 'vitest';
import {
  V10_CAPABILITY_PLAN_CONTRACT,
  V10_CAPABILITY_SELECTOR,
  v10CapabilityPlanHash,
  type V10CapabilityPlan,
} from '../../founder-os-lab/capabilityKernel.js';
import {
  dispatchFounderConveyorAdvance,
  expectedFounderConveyorReceiptId,
  founderConveyorIdempotencyKey,
  readFounderConveyorConfig,
  validateFounderConveyorAdvance,
  type FounderConveyorAdvanceInput,
} from '../n8nConveyor.js';

const SHA = 'a'.repeat(40);
const REGISTRY_HASH = 'b'.repeat(64);

function capabilityPlan(overrides: Partial<V10CapabilityPlan> = {}): V10CapabilityPlan {
  const base: Omit<V10CapabilityPlan, 'planHash'> = {
    contract: V10_CAPABILITY_PLAN_CONTRACT,
    selectedBy: V10_CAPABILITY_SELECTOR,
    goal: 'Advance one verified founder workflow stage.',
    projectSlug: 'founder-control-room',
    expectedHeadSha: SHA,
    registryHash: REGISTRY_HASH,
    requestedAuthority: 'draft',
    strategicLenses: ['me', 'futureyou', 'truthmode'],
    routingReason: 'Chief AI selected the smallest evidence-bound capability set.',
    capabilities: [{
      id: 'goalfix',
      version: '1.0.0',
      origin: 'founder-native',
      owner: 'juss',
      sourceHash: 'c'.repeat(64),
      authorityCeiling: 'privileged',
    }],
    proofRequirements: ['focused tests', 'exact-head evidence'],
    outcomeSignals: ['verification-pass'],
    rollback: 'Revert the focused branch.',
  };
  const merged = { ...base, ...overrides } as Omit<V10CapabilityPlan, 'planHash'>;
  return { ...merged, planHash: v10CapabilityPlanHash(merged) };
}

function candidate(overrides: Partial<FounderConveyorAdvanceInput> = {}): FounderConveyorAdvanceInput {
  const goal = overrides.goal ?? 'Advance one verified founder workflow stage.';
  const projectSlug = overrides.projectSlug ?? 'founder-control-room';
  const expectedHeadSha = overrides.expectedHeadSha ?? SHA;
  return {
    runId: 'run-123',
    projectSlug,
    goal,
    fromStage: 'workflows',
    toStage: 'code',
    expectedHeadSha,
    capabilityPlan: overrides.capabilityPlan ?? capabilityPlan({ goal, projectSlug, expectedHeadSha }),
    evidenceUrls: [],
    ...overrides,
  };
}

function enabledEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    N8N_CONVEYOR_ENABLED: 'true',
    N8N_CONVEYOR_WEBHOOK_URL: 'https://n8n.example.com/webhook/fcr',
    N8N_CONVEYOR_BEARER_TOKEN: 'bridge-secret',
    ...extra,
  };
}

describe('n8n founder conveyor contract', () => {
  it('keeps the bridge disabled by default', () => {
    expect(readFounderConveyorConfig({})).toEqual({
      configured: false,
      enabled: false,
      webhookUrl: null,
      bearerToken: null,
    });
  });

  it('requires both a reviewed webhook and server-side bearer token', () => {
    expect(readFounderConveyorConfig({
      N8N_CONVEYOR_ENABLED: 'true',
      N8N_CONVEYOR_WEBHOOK_URL: 'https://n8n.example.com/webhook/fcr',
    }).configured).toBe(false);

    expect(readFounderConveyorConfig(enabledEnv()).configured).toBe(true);
  });

  it('accepts only the five-stage loop in order and requires a valid Chief AI plan', () => {
    expect(validateFounderConveyorAdvance(candidate())).toEqual([]);
    expect(validateFounderConveyorAdvance(candidate({ fromStage: 'chat', toStage: 'code' })))
      .toContain('transition must advance chat -> workflows');
    expect(validateFounderConveyorAdvance(candidate({
      fromStage: 'skills',
      toStage: 'chat',
      evidenceUrls: ['https://github.com/jussray/founder-control-room/actions/runs/1'],
    }))).toEqual([]);
  });

  it('requires proof before code can become project state', () => {
    expect(validateFounderConveyorAdvance(candidate({ fromStage: 'code', toStage: 'projects' })))
      .toContain('evidence is required for code -> projects');
  });

  it('derives stable v3 retry identity from exact stage, head, and capability plan', () => {
    const first = founderConveyorIdempotencyKey(candidate());
    const retry = founderConveyorIdempotencyKey(candidate());
    const nextHead = founderConveyorIdempotencyKey(candidate({ expectedHeadSha: 'b'.repeat(40) }));
    const nextPlan = founderConveyorIdempotencyKey(candidate({
      capabilityPlan: capabilityPlan({
        capabilities: [{
          id: 'repo-truth',
          version: '1.0.0',
          origin: 'repo-native',
          owner: 'chief-ai-machine',
          sourceHash: 'd'.repeat(64),
          authorityCeiling: 'privileged',
        }],
      }),
    }));

    expect(first).toBe(retry);
    expect(first).toMatch(/^fcr-conveyor-v3:[0-9a-f]{64}$/);
    expect(nextHead).not.toBe(first);
    expect(nextPlan).not.toBe(first);
  });

  it('fails closed while execution is disabled', async () => {
    const fetchImpl = vi.fn();
    const result = await dispatchFounderConveyorAdvance(candidate(), {
      env: {
        N8N_CONVEYOR_ENABLED: 'false',
        N8N_CONVEYOR_WEBHOOK_URL: 'https://n8n.example.com/webhook/fcr',
        N8N_CONVEYOR_BEARER_TOKEN: 'bridge-secret',
      },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.code).toBe('CONVEYOR_DISABLED');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('dispatches only when n8n returns the exact canonical v3 plan-bound receipt', async () => {
    const input = candidate({
      fromStage: 'code',
      toStage: 'projects',
      evidenceUrls: ['https://github.com/jussray/founder-control-room/commit/'.concat(SHA)],
    });
    const expectedReceipt = expectedFounderConveyorReceiptId(input);

    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.contract).toBe('founder-control-room/n8n-conveyor@v3');
      expect(body.idempotencyKey).toMatch(/^fcr-conveyor-v3:[0-9a-f]{64}$/);
      expect(body.capabilityPlan.selectedBy).toBe('chief-ai-machine');
      expect(body.capabilityPlan.planHash).toBe(input.capabilityPlan.planHash);
      expect(body.authority).toEqual({
        advanceStage: true,
        merge: false,
        deploy: false,
        publish: false,
        sendExternal: false,
      });
      expect(init?.headers).toMatchObject({
        Authorization: 'Bearer bridge-secret',
        'Idempotency-Key': body.idempotencyKey,
        'X-FCR-Conveyor-Contract': 'v3',
      });
      return new Response(JSON.stringify({ receiptId: expectedReceipt }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const result = await dispatchFounderConveyorAdvance(input, {
      env: enabledEnv(),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result).toMatchObject({ ok: true, code: 'DISPATCHED', status: 202, receiptId: expectedReceipt });
  });

  it('persists only sanitized V10 receipt identity when production persistence is required', async () => {
    const proofUrl = `https://github.com/jussray/founder-control-room/commit/${SHA}`;
    const input = candidate({
      fromStage: 'code',
      toStage: 'projects',
      evidenceUrls: [proofUrl],
    });
    const expectedReceipt = expectedFounderConveyorReceiptId(input);
    const store = vi.fn(async (receipt: Record<string, unknown>) => {
      expect(receipt).toMatchObject({
        receiptId: expectedReceipt,
        runId: 'run-123',
        projectSlug: 'founder-control-room',
        expectedHeadSha: SHA,
        capabilityPlanHash: input.capabilityPlan.planHash,
        registryHash: REGISTRY_HASH,
        fromStage: 'code',
        toStage: 'projects',
        requestedAuthority: 'draft',
        executionStatus: 'accepted',
      });
      expect(receipt.evidenceDigest).toMatch(/^[0-9a-f]{64}$/);
      const serialized = JSON.stringify(receipt);
      expect(serialized).not.toContain(input.goal);
      expect(serialized).not.toContain(proofUrl);
      return 'stored' as const;
    });

    const result = await dispatchFounderConveyorAdvance(input, {
      env: enabledEnv({ FCR_V10_RECEIPT_PERSISTENCE_REQUIRED: 'true' }),
      fetchImpl: (async () => new Response(JSON.stringify({ receiptId: expectedReceipt }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })) as typeof fetch,
      receiptStore: { store },
    });

    expect(result).toMatchObject({ ok: true, code: 'DISPATCHED', receiptId: expectedReceipt });
    expect(store).toHaveBeenCalledTimes(1);
  });

  it('reports audit-incomplete and preserves the receipt when n8n succeeds but Supabase persistence fails', async () => {
    const input = candidate();
    const expectedReceipt = expectedFounderConveyorReceiptId(input);

    const result = await dispatchFounderConveyorAdvance(input, {
      env: enabledEnv({ FCR_V10_RECEIPT_PERSISTENCE_REQUIRED: 'true' }),
      fetchImpl: (async () => new Response(JSON.stringify({ receiptId: expectedReceipt }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })) as typeof fetch,
      receiptStore: {
        async store() {
          throw new Error('supabase unavailable');
        },
      },
    });

    expect(result).toMatchObject({
      ok: false,
      code: 'DISPATCH_AUDIT_INCOMPLETE',
      status: 500,
      receiptId: expectedReceipt,
    });
    expect(result.reasons.join(' ')).toContain('do not retry automatically');
  });

  it('reports audit-incomplete on a conflicting durable receipt instead of overwriting history', async () => {
    const input = candidate();
    const expectedReceipt = expectedFounderConveyorReceiptId(input);

    const result = await dispatchFounderConveyorAdvance(input, {
      env: enabledEnv({ FCR_V10_RECEIPT_PERSISTENCE_REQUIRED: 'true' }),
      fetchImpl: (async () => new Response(JSON.stringify({ receiptId: expectedReceipt }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })) as typeof fetch,
      receiptStore: { store: async () => 'conflict' },
    });

    expect(result.code).toBe('DISPATCH_AUDIT_INCOMPLETE');
    expect(result.receiptId).toBe(expectedReceipt);
  });

  it('blocks a receipt that does not match the exact V10 transition identity', async () => {
    const result = await dispatchFounderConveyorAdvance(candidate(), {
      env: enabledEnv(),
      fetchImpl: (async () => new Response(JSON.stringify({ receiptId: `fcr-conveyor-receipt-v3:${'0'.repeat(64)}` }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })) as typeof fetch,
    });

    expect(result.code).toBe('UPSTREAM_RECEIPT_MISMATCH');
    expect(result.ok).toBe(false);
  });

  it('does not claim success when n8n omits the receipt', async () => {
    const result = await dispatchFounderConveyorAdvance(candidate(), {
      env: enabledEnv(),
      fetchImpl: (async () => new Response(JSON.stringify({ accepted: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })) as typeof fetch,
    });

    expect(result.code).toBe('UPSTREAM_RECEIPT_MISSING');
  });

  it('refuses a capability plan that tries to carry privileged execution authority', () => {
    expect(validateFounderConveyorAdvance(candidate({
      capabilityPlan: capabilityPlan({ requestedAuthority: 'privileged' }),
    }))).toContain('conveyor stage advancement cannot carry reversible or privileged execution authority');
  });
});
