import { describe, expect, it, vi } from 'vitest';
import {
  dispatchFounderConveyorAdvance,
  expectedFounderConveyorReceiptId,
  founderConveyorIdempotencyKey,
  readFounderConveyorConfig,
  validateFounderConveyorAdvance,
  type FounderConveyorAdvanceInput,
} from '../n8nConveyor.js';

const SHA = 'a'.repeat(40);

function candidate(overrides: Partial<FounderConveyorAdvanceInput> = {}): FounderConveyorAdvanceInput {
  return {
    runId: 'run-123',
    projectSlug: 'founder-control-room',
    goal: 'Advance one verified founder workflow stage.',
    fromStage: 'workflows',
    toStage: 'code',
    expectedHeadSha: SHA,
    evidenceUrls: [],
    ...overrides,
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

    expect(readFounderConveyorConfig({
      N8N_CONVEYOR_ENABLED: 'true',
      N8N_CONVEYOR_WEBHOOK_URL: 'https://n8n.example.com/webhook/fcr',
      N8N_CONVEYOR_BEARER_TOKEN: 'bridge-secret',
    }).configured).toBe(true);
  });

  it('accepts only the five-stage loop in order', () => {
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

  it('derives stable v2 retry identity from the exact stage and head', () => {
    const first = founderConveyorIdempotencyKey(candidate());
    const retry = founderConveyorIdempotencyKey(candidate());
    const nextHead = founderConveyorIdempotencyKey(candidate({ expectedHeadSha: 'b'.repeat(40) }));

    expect(first).toBe(retry);
    expect(first).toMatch(/^fcr-conveyor-v2:[0-9a-f]{64}$/);
    expect(nextHead).not.toBe(first);
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

  it('dispatches only when n8n returns the exact canonical v2 receipt', async () => {
    const input = candidate({
      fromStage: 'code',
      toStage: 'projects',
      evidenceUrls: ['https://github.com/jussray/founder-control-room/commit/'.concat(SHA)],
    });
    const expectedReceipt = expectedFounderConveyorReceiptId(input);

    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.contract).toBe('founder-control-room/n8n-conveyor@v2');
      expect(body.idempotencyKey).toMatch(/^fcr-conveyor-v2:[0-9a-f]{64}$/);
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
        'X-FCR-Conveyor-Contract': 'v2',
      });
      return new Response(JSON.stringify({ receiptId: expectedReceipt }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const result = await dispatchFounderConveyorAdvance(input, {
      env: {
        N8N_CONVEYOR_ENABLED: 'true',
        N8N_CONVEYOR_WEBHOOK_URL: 'https://n8n.example.com/webhook/fcr',
        N8N_CONVEYOR_BEARER_TOKEN: 'bridge-secret',
      },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result).toMatchObject({ ok: true, code: 'DISPATCHED', status: 202, receiptId: expectedReceipt });
  });

  it('blocks a receipt that does not match the exact transition identity', async () => {
    const result = await dispatchFounderConveyorAdvance(candidate(), {
      env: {
        N8N_CONVEYOR_ENABLED: 'true',
        N8N_CONVEYOR_WEBHOOK_URL: 'https://n8n.example.com/webhook/fcr',
        N8N_CONVEYOR_BEARER_TOKEN: 'bridge-secret',
      },
      fetchImpl: (async () => new Response(JSON.stringify({ receiptId: `fcr-conveyor-receipt-v2:${'0'.repeat(64)}` }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })) as typeof fetch,
    });

    expect(result.code).toBe('UPSTREAM_RECEIPT_MISMATCH');
    expect(result.ok).toBe(false);
  });

  it('does not claim success when n8n omits the receipt', async () => {
    const result = await dispatchFounderConveyorAdvance(candidate(), {
      env: {
        N8N_CONVEYOR_ENABLED: 'true',
        N8N_CONVEYOR_WEBHOOK_URL: 'https://n8n.example.com/webhook/fcr',
        N8N_CONVEYOR_BEARER_TOKEN: 'bridge-secret',
      },
      fetchImpl: (async () => new Response(JSON.stringify({ accepted: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })) as typeof fetch,
    });

    expect(result.code).toBe('UPSTREAM_RECEIPT_MISSING');
  });
});
