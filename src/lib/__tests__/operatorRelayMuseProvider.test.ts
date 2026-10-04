import { describe, expect, it, vi } from 'vitest';
import {
  OPERATOR_RELAY_REQUEST_CONTRACT,
  operatorRelayRequestHash,
  relayContextFingerprint,
  type OperatorRelayRequestV1,
} from '../operatorRelay.js';
import { createServerMuseRelayAdapter } from '../operatorRelayMuseProvider.js';

const KEY = 'fixture-meta-model-key';

function relay(
  capability: OperatorRelayRequestV1['capability'] = 'implement',
  sensitivity: OperatorRelayRequestV1['sensitivity'] = 'internal',
): OperatorRelayRequestV1 {
  const summary = 'Challenge the current implementation and return bounded evidence.';
  const sourceRef = 'chat:muse-provider-test';
  const base: Omit<OperatorRelayRequestV1, 'requestHash'> = {
    contract: OPERATOR_RELAY_REQUEST_CONTRACT,
    relayId: 'relay-muse-provider-test',
    fromOperator: 'codex',
    toOperator: 'muse',
    capability,
    goal: 'Find contradictions and the smallest safe fix',
    context: {
      summary,
      sourceRef,
      sourceFingerprint: relayContextFingerprint(summary, sourceRef),
    },
    authority: {
      externalWrite: false,
      merge: false,
      deploy: false,
      publish: false,
      providerMutation: false,
    },
    sensitivity,
    createdAt: '2026-09-24T19:00:00.000Z',
    expiresAt: '2099-09-24T19:10:00.000Z',
  };
  return { ...base, requestHash: operatorRelayRequestHash(base) };
}

describe('createServerMuseRelayAdapter', () => {
  it('does not advertise Muse without both the Meta key and an explicit safe model', () => {
    expect(createServerMuseRelayAdapter({}, vi.fn() as typeof fetch)).toBeUndefined();
    expect(createServerMuseRelayAdapter({ MODEL_API_KEY: KEY }, vi.fn() as typeof fetch)).toBeUndefined();
    expect(createServerMuseRelayAdapter({
      MODEL_API_KEY: KEY,
      FCR_RELAY_MUSE_MODEL: 'muse-spark-1.3?unsafe=1',
    }, vi.fn() as typeof fetch)).toBeUndefined();
  });

  it('calls Meta Model API with a bounded non-stored Muse request and returns provider evidence', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe('https://api.meta.ai/v1/responses');
      expect(init?.method).toBe('POST');
      expect(init?.redirect).toBe('error');
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      expect(init?.headers).toMatchObject({
        Authorization: `Bearer ${KEY}`,
        'Content-Type': 'application/json',
      });

      const serialized = String(init?.body ?? '');
      expect(serialized).not.toContain(KEY);
      expect(JSON.parse(serialized)).toMatchObject({
        model: 'muse-spark-1.3',
        input: expect.stringContaining('independent truth challenger'),
        store: false,
        max_output_tokens: 2000,
      });

      return new Response(JSON.stringify({
        id: 'resp_muse_123',
        object: 'response',
        status: 'completed',
        output: [{
          type: 'message',
          role: 'assistant',
          status: 'completed',
          content: [{ type: 'output_text', text: 'Muse found one contradictory runtime claim.' }],
        }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as typeof fetch;

    const adapter = createServerMuseRelayAdapter({
      MODEL_API_KEY: KEY,
      FCR_RELAY_MUSE_MODEL: 'muse-spark-1.3',
    }, fetchMock);

    const response = await adapter?.(relay());
    expect(response).toMatchObject({
      fromOperator: 'muse',
      toOperator: 'codex',
      status: 'completed',
      answer: 'Muse found one contradictory runtime claim.',
      evidenceRefs: ['provider:meta:resp_muse_123'],
      authorityRequested: 'none',
    });
  });

  it('blocks restricted context and the paused semantic-review spend lane before network access', async () => {
    const fetchMock = vi.fn() as unknown as typeof fetch;
    const adapter = createServerMuseRelayAdapter({
      MODEL_API_KEY: KEY,
      FCR_RELAY_MUSE_MODEL: 'muse-spark-1.3',
    }, fetchMock);

    await expect(adapter?.(relay('implement', 'restricted'))).rejects.toThrow(
      'restricted relay context requires a separately approved provider data policy',
    );
    await expect(adapter?.(relay('review', 'internal'))).rejects.toThrow(
      'semantic peer review is paused by founder cost-control policy',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails closed on non-completed output without promoting provider error detail', async () => {
    const marker = 'secret-provider-detail';
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      id: 'resp_muse_failed',
      status: 'failed',
      error: { message: marker },
      output: [],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;

    const adapter = createServerMuseRelayAdapter({
      MODEL_API_KEY: KEY,
      FCR_RELAY_MUSE_MODEL: 'muse-spark-1.3',
    }, fetchMock);
    const call = adapter?.(relay());

    await expect(call).rejects.toThrow('Muse relay returned a non-completed response');
    await expect(call).rejects.not.toThrow(marker);
  });
});
