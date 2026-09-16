import { describe, expect, it, vi } from 'vitest';
import {
  OPERATOR_RELAY_REQUEST_CONTRACT,
  operatorRelayRequestHash,
  relayContextFingerprint,
  type OperatorRelayRequestV1,
} from '../operatorRelay.js';
import { createServerOperatorRelayAdapters } from '../operatorRelayModelProviders.js';

function relay(
  sensitivity: OperatorRelayRequestV1['sensitivity'] = 'internal',
  contextSummary = 'Attack the current bridge and return surviving defects.',
): OperatorRelayRequestV1 {
  const summary = contextSummary;
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
  it('does not advertise an operator without direct provider config or an authorized handoff', () => {
    const adapters = createServerOperatorRelayAdapters({ PERPLEXITY_API_KEY: 'secret' }, vi.fn() as typeof fetch);
    expect(adapters.perplexity).toBeUndefined();
  });

  it('calls the current Perplexity Responses-compatible provider endpoint and binds server-side provenance', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe('https://api.perplexity.ai/v1/responses');
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer pplx-secret' });
      const payload = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(payload.model).toBe('perplexity-model');
      expect(payload.store).toBe(false);
      expect(payload.tools).toEqual([{ type: 'web_search' }]);
      expect(String(init?.body)).not.toContain('pplx-secret');
      return new Response(JSON.stringify({
        id: 'pplx-response-1',
        model: 'provider-returned-model-cannot-rewrite-provenance',
        output: [{ type: 'message', content: [{ type: 'output_text', text: 'Perplexity review result' }] }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as typeof fetch;

    const adapters = createServerOperatorRelayAdapters({
      PERPLEXITY_API_KEY: 'pplx-secret',
      FCR_RELAY_PERPLEXITY_MODEL: 'perplexity-model',
    }, fetchMock);

    const response = await adapters.perplexity?.(relay());
    expect(response?.fromOperator).toBe('perplexity');
    expect(response?.answer).toBe('Perplexity review result');
    expect(response?.evidenceRefs).toEqual([
      'provider:perplexity:model:perplexity-model:response:pplx-response-1',
    ]);
  });

  it('fails closed before provider dispatch for restricted context', async () => {
    const fetchMock = vi.fn() as unknown as typeof fetch;
    const adapters = createServerOperatorRelayAdapters({
      PERPLEXITY_API_KEY: 'pplx-secret',
      FCR_RELAY_PERPLEXITY_MODEL: 'perplexity-model',
    }, fetchMock);

    await expect(adapters.perplexity?.(relay('restricted'))).rejects.toThrow('restricted relay context');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails closed before provider dispatch when relay context appears to contain a secret value', async () => {
    const fetchMock = vi.fn() as unknown as typeof fetch;
    const adapters = createServerOperatorRelayAdapters({
      PERPLEXITY_API_KEY: 'pplx-secret',
      FCR_RELAY_PERPLEXITY_MODEL: 'perplexity-model',
    }, fetchMock);

    await expect(adapters.perplexity?.(relay('internal', 'Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456')))
      .rejects.toThrow('secret-bearing material');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never surfaces a provider error body that could echo secrets', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      error: { message: 'echoed secret pplx-secret and private prompt' },
    }), { status: 401, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;
    const adapters = createServerOperatorRelayAdapters({
      PERPLEXITY_API_KEY: 'pplx-secret',
      FCR_RELAY_PERPLEXITY_MODEL: 'perplexity-model',
    }, fetchMock);

    const invocation = adapters.perplexity?.(relay());
    await expect(invocation).rejects.toThrow('Perplexity relay failed with HTTP 401');
    await expect(invocation).rejects.not.toThrow('pplx-secret');
  });

  it('returns an explicitly blocked browser handoff instead of substituting a provider', async () => {
    const fetchMock = vi.fn() as unknown as typeof fetch;
    const adapters = createServerOperatorRelayAdapters({
      FCR_RELAY_PERPLEXITY_INTERACTIVE_BROWSER_HANDOFF: 'enabled',
    }, fetchMock);

    const response = await adapters.perplexity?.(relay());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(response?.status).toBe('blocked');
    expect(response?.unresolved).toContain('relay_transport:interactive_browser');
    expect(response?.evidenceRefs).toEqual([]);
  });
});
