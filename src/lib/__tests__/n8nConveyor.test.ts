import { describe, expect, it, vi } from 'vitest';
import {
  dispatchFounderConveyorAdvance,
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

  it('accepts only the five-stage loop in order', () => {
    expect(validateFounderConveyorAdvance(candidate())).toEqual([]);
    expect(validateFounderConveyorAdvance(candidate({ fromStage: 'chat', toStage: 'code' })))
      .toContain('transition must advance chat -> workflows');
    expect(validateFounderConveyorAdvance(candidate({ fromStage: 'skills', toStage: 'chat' })))
      .toEqual([]);
  });

  it('requires proof before code can become project state', () => {
    expect(validateFounderConveyorAdvance(candidate({ fromStage: 'code', toStage: 'projects' })))
      .toContain('evidence is required for code -> projects');

    expect(validateFounderConveyorAdvance(candidate({
      fromStage: 'code',
      toStage: 'projects',
      evidenceUrls: ['https://github.com/jussray/founder-control-room/actions/runs/1'],
    }))).toEqual([]);
  });

  it('requires an exact immutable Git SHA', () => {
    expect(validateFounderConveyorAdvance(candidate({ expectedHeadSha: 'main' })))
      .toContain('expectedHeadSha must be a full 40-character Git commit SHA');
  });

  it('fails closed while execution is disabled', async () => {
    const fetchImpl = vi.fn();
    const result = await dispatchFounderConveyorAdvance(candidate(), {
      env: {
        N8N_CONVEYOR_ENABLED: 'false',
        N8N_CONVEYOR_WEBHOOK_URL: 'https://n8n.example.com/webhook/fcr',
      },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.code).toBe('CONVEYOR_DISABLED');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('dispatches a proof-bound stage transition without merge/deploy/publish authority', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.expectedHeadSha).toBe(SHA);
      expect(body.authority).toEqual({
        advanceStage: true,
        merge: false,
        deploy: false,
        publish: false,
        sendExternal: false,
      });
      expect(init?.headers).toMatchObject({
        Authorization: 'Bearer bridge-secret',
        'X-FCR-Conveyor-Contract': 'v1',
      });
      return new Response(JSON.stringify({ receiptId: 'n8n-execution-77' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const result = await dispatchFounderConveyorAdvance(candidate({
      fromStage: 'code',
      toStage: 'projects',
      evidenceUrls: ['https://github.com/jussray/founder-control-room/commit/'.concat(SHA)],
    }), {
      env: {
        N8N_CONVEYOR_ENABLED: 'true',
        N8N_CONVEYOR_WEBHOOK_URL: 'https://n8n.example.com/webhook/fcr',
        N8N_CONVEYOR_BEARER_TOKEN: 'bridge-secret',
      },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result).toMatchObject({
      ok: true,
      code: 'DISPATCHED',
      status: 202,
      receiptId: 'n8n-execution-77',
    });
  });

  it('does not leak an upstream body when n8n rejects a transition', async () => {
    const result = await dispatchFounderConveyorAdvance(candidate(), {
      env: {
        N8N_CONVEYOR_ENABLED: 'true',
        N8N_CONVEYOR_WEBHOOK_URL: 'https://n8n.example.com/webhook/fcr',
      },
      fetchImpl: (async () => new Response(JSON.stringify({ secret: 'do-not-return' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })) as typeof fetch,
    });

    expect(result).toEqual({
      ok: false,
      code: 'UPSTREAM_REJECTED',
      status: 502,
      receiptId: null,
      reasons: ['n8n rejected the conveyor transition with HTTP 500'],
    });
  });
});
