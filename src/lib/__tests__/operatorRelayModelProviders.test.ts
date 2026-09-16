import { describe, expect, it, vi } from 'vitest';
import {
  OPERATOR_RELAY_REQUEST_CONTRACT,
  operatorRelayRequestHash,
  relayContextFingerprint,
  type OperatorRelayRequestV1,
  type RelayOperatorId,
} from '../operatorRelay.js';
import {
  createServerOperatorRelayAdapters,
  OPERATOR_RELAY_MAX_ERROR_BYTES,
  OPERATOR_RELAY_PROVIDER_TIMEOUT_MS,
} from '../operatorRelayModelProviders.js';

function relay(
  sensitivity: OperatorRelayRequestV1['sensitivity'] = 'internal',
  toOperator: RelayOperatorId = 'perplexity',
): OperatorRelayRequestV1 {
  const summary = 'Attack the current bridge and return surviving defects.';
  const sourceRef = 'chat:test';
  const base: Omit<OperatorRelayRequestV1, 'requestHash'> = {
    contract: OPERATOR_RELAY_REQUEST_CONTRACT,
    relayId: 'relay-provider-test',
    fromOperator: 'codex',
    toOperator,
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

  it('uses the current Anthropic Messages HTTP contract without serializing the API key', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe('https://api.anthropic.com/v1/messages');
      expect(init?.method).toBe('POST');
      expect(init?.headers).toMatchObject({
        'x-api-key': 'anthropic-test-secret',
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      });
      const serialized = String(init?.body ?? '');
      expect(serialized).not.toContain('anthropic-test-secret');
      expect(JSON.parse(serialized)).toMatchObject({
        model: 'claude-current-test',
        max_tokens: 2_000,
        messages: [{ role: 'user' }],
      });
      return new Response(JSON.stringify({
        id: 'anthropic-response-1',
        provider: 'spoofed-provider-name',
        content: [{ type: 'text', text: 'Anthropic review result' }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as typeof fetch;

    const adapters = createServerOperatorRelayAdapters({
      ANTHROPIC_API_KEY: 'anthropic-test-secret',
      FCR_RELAY_ANTHROPIC_MODEL: 'claude-current-test',
    }, fetchMock);

    const response = await adapters['claude-code']?.(relay('internal', 'claude-code'));
    expect(response?.fromOperator).toBe('claude-code');
    expect(response?.answer).toBe('Anthropic review result');
    expect(response?.evidenceRefs).toEqual(['provider:anthropic:anthropic-response-1']);
    expect(OPERATOR_RELAY_PROVIDER_TIMEOUT_MS).toBe(60_000);
  });

  it('redacts an echoed Anthropic key from bounded provider errors', async () => {
    const secret = 'anthropic-super-secret';
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      type: 'error',
      error: {
        type: 'authentication_error',
        message: `bad credential ${secret}`,
      },
    }), { status: 401, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;

    const adapters = createServerOperatorRelayAdapters({
      ANTHROPIC_API_KEY: secret,
      FCR_RELAY_ANTHROPIC_MODEL: 'claude-current-test',
    }, fetchMock);

    let message = '';
    try {
      await adapters['claude-code']?.(relay('internal', 'claude-code'));
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain('[REDACTED]');
    expect(message).not.toContain(secret);
  });

  it('rejects oversized provider error bodies instead of reading them as diagnostic text', async () => {
    const oversized = JSON.stringify({ error: { message: 'x'.repeat(OPERATOR_RELAY_MAX_ERROR_BYTES + 1) } });
    const fetchMock = vi.fn(async () => new Response(oversized, {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })) as typeof fetch;
    const adapters = createServerOperatorRelayAdapters({
      ANTHROPIC_API_KEY: 'bounded-secret',
      FCR_RELAY_ANTHROPIC_MODEL: 'claude-current-test',
    }, fetchMock);

    await expect(adapters['claude-code']?.(relay('internal', 'claude-code')))
      .rejects.toThrow(`Anthropic relay response exceeded ${OPERATOR_RELAY_MAX_ERROR_BYTES} byte limit`);
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
