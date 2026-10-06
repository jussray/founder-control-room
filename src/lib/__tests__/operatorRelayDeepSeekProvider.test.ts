import { describe, expect, it, vi } from 'vitest';
import {
  OPERATOR_RELAY_REQUEST_CONTRACT,
  operatorRelayRequestHash,
  relayContextFingerprint,
  type OperatorRelayRequestV1,
} from '../operatorRelay.js';
import { createServerOperatorRelayAdapters } from '../operatorRelayModelProviders.js';

const FIXTURE = 'fixture-deepseek-key';

function relay(
  capability: OperatorRelayRequestV1['capability'] = 'research',
): OperatorRelayRequestV1 {
  const summary = 'Attack the bounded claim and return attributable evidence.';
  const sourceRef = 'chat:deepseek-provider-test';
  const base: Omit<OperatorRelayRequestV1, 'requestHash'> = {
    contract: OPERATOR_RELAY_REQUEST_CONTRACT,
    relayId: 'relay-deepseek-provider-test',
    fromOperator: 'codex',
    toOperator: 'deepseek',
    capability,
    goal: 'Focused DeepSeek peer work',
    context: { summary, sourceRef, sourceFingerprint: relayContextFingerprint(summary, sourceRef) },
    authority: {
      externalWrite: false,
      merge: false,
      deploy: false,
      publish: false,
      providerMutation: false,
    },
    sensitivity: 'internal',
    createdAt: '2026-09-24T06:20:00.000Z',
    expiresAt: '2099-09-24T06:30:00.000Z',
  };
  return { ...base, requestHash: operatorRelayRequestHash(base) };
}

describe('DeepSeek peer relay provider', () => {
  it('does not advertise DeepSeek without both a key and a current explicit model', () => {
    expect(createServerOperatorRelayAdapters({
      DEEPSEEK_API_KEY: FIXTURE,
    }, vi.fn() as typeof fetch).deepseek).toBeUndefined();

    expect(createServerOperatorRelayAdapters({
      FCR_RELAY_DEEPSEEK_MODEL: 'deepseek-flash',
    }, vi.fn() as typeof fetch).deepseek).toBeUndefined();
  });

  it.each(['deepseek-chat', 'deepseek-reasoner', 'deepseek-v4-flash', 'deepseek-flash?x=1'])(
    'fails closed for unsupported or legacy model id %s',
    (model) => {
      const adapters = createServerOperatorRelayAdapters({
        DEEPSEEK_API_KEY: FIXTURE,
        FCR_RELAY_DEEPSEEK_MODEL: model,
      }, vi.fn() as typeof fetch);
      expect(adapters.deepseek).toBeUndefined();
    },
  );

  it.each(['deepseek-flash', 'deepseek-v4-pro'])(
    'calls the stateless DeepSeek Responses API with current model %s',
    async (model) => {
      const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        expect(String(url)).toBe('https://api.deepseek.com/responses');
        expect(init?.method).toBe('POST');
        expect(init?.redirect).toBe('error');
        expect(init?.signal).toBeInstanceOf(AbortSignal);
        expect(init?.headers).toMatchObject({
          Authorization: `Bearer ${FIXTURE}`,
          'Content-Type': 'application/json',
        });
        expect(String(url)).not.toContain(FIXTURE);
        const serialized = String(init?.body ?? '');
        expect(serialized).not.toContain(FIXTURE);
        expect(JSON.parse(serialized)).toMatchObject({
          model,
          input: expect.any(String),
          max_output_tokens: 2000,
        });
        return new Response(JSON.stringify({
          id: `resp_${model.replace(/[^a-z0-9]/gi, '_')}`,
          object: 'response',
          status: 'completed',
          output: [{
            type: 'message',
            content: [{ type: 'output_text', text: 'DeepSeek peer result' }],
          }],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }) as typeof fetch;

      const adapters = createServerOperatorRelayAdapters({
        DEEPSEEK_API_KEY: FIXTURE,
        FCR_RELAY_DEEPSEEK_MODEL: model,
      }, fetchMock);
      const response = await adapters.deepseek?.(relay());

      expect(response).toMatchObject({
        fromOperator: 'deepseek',
        toOperator: 'codex',
        answer: 'DeepSeek peer result',
        authorityRequested: 'none',
      });
      expect(response?.evidenceRefs).toEqual([
        `provider:deepseek:resp_${model.replace(/[^a-z0-9]/gi, '_')}`,
      ]);
    },
  );

  it('blocks semantic review spend before DeepSeek is called', async () => {
    const fetchMock = vi.fn() as unknown as typeof fetch;
    const adapters = createServerOperatorRelayAdapters({
      DEEPSEEK_API_KEY: FIXTURE,
      FCR_RELAY_DEEPSEEK_MODEL: 'deepseek-flash',
    }, fetchMock);

    await expect(adapters.deepseek?.(relay('review'))).rejects.toThrow(
      'semantic peer review is paused',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not promote a failed DeepSeek response into a completed peer answer', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      id: 'resp_deepseek_failed',
      object: 'response',
      status: 'failed',
      error: { message: 'provider detail must stay bounded' },
      output: [],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;

    const adapters = createServerOperatorRelayAdapters({
      DEEPSEEK_API_KEY: FIXTURE,
      FCR_RELAY_DEEPSEEK_MODEL: 'deepseek-flash',
    }, fetchMock);

    await expect(adapters.deepseek?.(relay())).rejects.toThrow(
      'DeepSeek relay returned a non-completed response',
    );
  });
});
