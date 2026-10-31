import { describe, expect, it, vi } from 'vitest';
import {
  OPERATOR_RELAY_REQUEST_CONTRACT,
  operatorRelayRequestHash,
  relayContextFingerprint,
  type OperatorRelayRequestV1,
} from '../operatorRelay.js';
import { createServerOperatorRelayAdapters } from '../operatorRelayModelProviders.js';

function relay(): OperatorRelayRequestV1 {
  const summary = 'Perform the current bounded provider task and return evidence.';
  const sourceRef = 'chat:openai-completion-boundary';
  const base: Omit<OperatorRelayRequestV1, 'requestHash'> = {
    contract: OPERATOR_RELAY_REQUEST_CONTRACT,
    relayId: 'relay-openai-completion-boundary',
    fromOperator: 'codex',
    toOperator: 'codex',
    capability: 'implement',
    goal: 'Reject unfinished OpenAI output',
    context: { summary, sourceRef, sourceFingerprint: relayContextFingerprint(summary, sourceRef) },
    authority: { externalWrite: false, merge: false, deploy: false, publish: false, providerMutation: false },
    sensitivity: 'internal',
    createdAt: '2026-10-05T05:00:00.000Z',
    expiresAt: '2099-10-05T05:10:00.000Z',
  };
  return { ...base, requestHash: operatorRelayRequestHash(base) };
}

const env = {
  OPENAI_API_KEY: 'fixture-key',
  FCR_RELAY_OPENAI_MODEL: 'gpt-test-model',
};

describe('OpenAI relay completion boundary', () => {
  it('accepts completed OpenAI output with provider evidence', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      id: 'resp_complete',
      status: 'completed',
      output_text: 'finished answer',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;
    const adapters = createServerOperatorRelayAdapters(env, fetchMock);
    await expect(adapters.codex?.(relay())).resolves.toMatchObject({
      answer: 'finished answer',
      evidenceRefs: ['provider:openai:resp_complete'],
      authorityRequested: 'none',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  for (const status of ['incomplete', 'failed', 'cancelled', 'queued', 'in_progress', undefined]) {
    it(`rejects OpenAI status ${String(status)} without retrying`, async () => {
      const fetchMock = vi.fn(async () => new Response(JSON.stringify({
        id: 'resp_partial',
        status,
        output_text: 'unfinished answer',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;
      const adapters = createServerOperatorRelayAdapters(env, fetchMock);
      await expect(adapters.codex?.(relay())).rejects.toThrow('OpenAI relay returned a non-completed response');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  }
});
