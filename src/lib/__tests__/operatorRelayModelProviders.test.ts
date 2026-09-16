import { describe, expect, it, vi } from 'vitest';
import {
  OPERATOR_RELAY_REQUEST_CONTRACT,
  operatorRelayRequestHash,
  relayContextFingerprint,
  type OperatorRelayRequestV1,
} from '../operatorRelay.js';
import { createServerOperatorRelayAdapters } from '../operatorRelayModelProviders.js';

function relay(sensitivity: OperatorRelayRequestV1['sensitivity'] = 'internal'): OperatorRelayRequestV1 {
  const summary = 'Attack the current bridge and return surviving defects.';
  const sourceRef = 'chat:test';
  const base: Omit<OperatorRelayRequestV1, 'requestHash'> = {
    contract: OPERATOR_RELAY_REQUEST_CONTRACT,
    relayId: 'relay-provider-test',
    fromOperator: 'codex',
    toOperator: 'perplexity',
    capability: 'review',
    goal: 'Independent review',
    context: { summary, sourceRef, sourceFingerprint: relayContextFingerprint(summary, sourceRef) },
    authority: { externalWrite: false, merge: false, deploy: false, publish: false, providerMutation: false },
    sensitivity,
    createdAt: '2026-09-16T06:30:00.000Z',
    expiresAt: '2099-09-16T06:40:00.000Z',
  };
  return { ...base, requestHash: operatorRelayRequestHash(base) };
}

describe('createServerOperatorRelayAdapters', () => {
  it('does not advertise an operator without both its key and explicit model', () => {
    const adapters = createServerOperatorRelayAdapters({ PERPLEXITY_API_KEY: 'secret' }, vi.fn() as typeof fetch);
    expect(adapters.perplexity).toBeUndefined();
  });

  it('calls the exact Perplexity provider and binds provider response identity', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe('https://api.perplexity.ai/v1/sonar');
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer pplx-secret' });
      return new Response(JSON.stringify({
        id: 'pplx-response-1',
        choices: [{ message: { content: 'Perplexity review result' } }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as typeof fetch;

    const adapters = createServerOperatorRelayAdapters({
      PERPLEXITY_API_KEY: 'pplx-secret',
      FCR_RELAY_PERPLEXITY_MODEL: 'sonar',
    }, fetchMock);

    const response = await adapters.perplexity?.(relay());
    expect(response?.fromOperator).toBe('perplexity');
    expect(response?.answer).toBe('Perplexity review result');
    expect(response?.evidenceRefs).toEqual(['provider:perplexity:pplx-response-1']);
  });

  it('fails closed before provider dispatch for restricted context', async () => {
    const fetchMock = vi.fn() as unknown as typeof fetch;
    const adapters = createServerOperatorRelayAdapters({
      PERPLEXITY_API_KEY: 'pplx-secret',
      FCR_RELAY_PERPLEXITY_MODEL: 'sonar',
    }, fetchMock);

    await expect(adapters.perplexity?.(relay('restricted'))).rejects.toThrow('restricted relay context');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
