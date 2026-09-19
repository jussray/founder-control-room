import { describe, expect, it, vi } from 'vitest';
import {
  OPERATOR_RELAY_REQUEST_CONTRACT,
  operatorRelayRequestHash,
  relayContextFingerprint,
  type OperatorRelayRequestV1,
} from '../operatorRelay.js';
import { createServerOperatorRelayAdapters } from '../operatorRelayModelProviders.js';

function relay(): OperatorRelayRequestV1 {
  const summary = 'Verify Anthropic response identity before evidence is minted.';
  const sourceRef = 'test:anthropic-response-identity';
  const base: Omit<OperatorRelayRequestV1, 'requestHash'> = {
    contract: OPERATOR_RELAY_REQUEST_CONTRACT,
    relayId: 'relay-anthropic-identity-test',
    fromOperator: 'codex',
    toOperator: 'claude-code',
    capability: 'review',
    goal: 'Independent provider review',
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
    sensitivity: 'internal',
    createdAt: '2026-09-19T02:00:00.000Z',
    expiresAt: '2099-09-19T02:10:00.000Z',
  };
  return { ...base, requestHash: operatorRelayRequestHash(base) };
}

function response(id?: string) {
  return {
    ...(id === undefined ? {} : { id }),
    type: 'message',
    role: 'assistant',
    content: [{ type: 'text', text: 'bounded review' }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
  };
}

describe('Anthropic provider response identity', () => {
  it('fails closed on a response id containing unsafe evidence characters', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(response('msg_bad/id')), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })) as typeof fetch;

    const adapters = createServerOperatorRelayAdapters({
      ANTHROPIC_API_KEY: 'test-anthropic-key',
      FCR_RELAY_ANTHROPIC_MODEL: 'claude-test-model',
    }, fetchMock);

    await expect(adapters['claude-code']?.(relay()))
      .rejects.toThrow('Anthropic relay returned invalid response identity');
  });

  it('fails closed when an otherwise valid Messages response has no provider response id', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(response()), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })) as typeof fetch;

    const adapters = createServerOperatorRelayAdapters({
      ANTHROPIC_API_KEY: 'test-anthropic-key',
      FCR_RELAY_ANTHROPIC_MODEL: 'claude-test-model',
    }, fetchMock);

    await expect(adapters['claude-code']?.(relay()))
      .rejects.toThrow('Anthropic relay returned invalid response identity');
  });
});
