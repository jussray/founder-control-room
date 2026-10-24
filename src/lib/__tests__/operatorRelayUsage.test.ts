import { describe, expect, it, vi } from 'vitest';
import {
  OPERATOR_RELAY_REQUEST_CONTRACT,
  OPERATOR_RELAY_RESPONSE_CONTRACT,
  operatorRelayRequestHash,
  operatorRelayResponseHash,
  relayContextFingerprint,
  validateOperatorRelayResponse,
  type OperatorRelayRequestV1,
  type OperatorRelayResponseV1,
} from '../operatorRelay.js';
import { createServerOperatorRelayAdapters } from '../operatorRelayModelProviders.js';

function relay(): OperatorRelayRequestV1 {
  const summary = 'Measure what this relay hop costs.';
  const sourceRef = 'chat:usage-test';
  const base: Omit<OperatorRelayRequestV1, 'requestHash'> = {
    contract: OPERATOR_RELAY_REQUEST_CONTRACT,
    relayId: 'relay-usage-test',
    fromOperator: 'codex',
    toOperator: 'claude-code',
    capability: 'implement',
    goal: 'Focused provider work',
    context: { summary, sourceRef, sourceFingerprint: relayContextFingerprint(summary, sourceRef) },
    authority: { externalWrite: false, merge: false, deploy: false, publish: false, providerMutation: false },
    sensitivity: 'internal',
    createdAt: '2026-10-06T18:00:00.000Z',
    expiresAt: '2099-10-06T18:10:00.000Z',
  };
  return { ...base, requestHash: operatorRelayRequestHash(base) };
}

function anthropicAdapter(usage: unknown) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({
    id: 'msg_usage',
    type: 'message',
    role: 'assistant',
    content: [{ type: 'text', text: 'measured answer' }],
    ...(usage === undefined ? {} : { usage }),
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as unknown as typeof fetch;
  return createServerOperatorRelayAdapters({
    ANTHROPIC_API_KEY: 'fixture-value',
    FCR_RELAY_ANTHROPIC_MODEL: 'claude-test-model',
  }, fetchMock)['claude-code']!;
}

describe('operator relay usage receipt', () => {
  it('binds provider-reported Anthropic token usage into a valid, hash-bound receipt', async () => {
    const request = relay();
    const response = await anthropicAdapter({
      input_tokens: 812,
      output_tokens: 240,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 512,
    })(request);
    expect(response.usage).toEqual({
      provider: 'anthropic',
      inputTokens: 812,
      outputTokens: 240,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 512,
    });
    expect(validateOperatorRelayResponse(response, request)).toEqual([]);
  });

  it('treats absent or null cache fields as zero', async () => {
    const response = await anthropicAdapter({ input_tokens: 10, output_tokens: 3, cache_read_input_tokens: null })(relay());
    expect(response.usage).toMatchObject({ cacheCreationInputTokens: 0, cacheReadInputTokens: 0 });
  });

  it('rejects a receipt whose usage was edited after hashing', async () => {
    const request = relay();
    const response = await anthropicAdapter({ input_tokens: 812, output_tokens: 240 })(request);
    const tampered: OperatorRelayResponseV1 = { ...response, usage: { ...response.usage!, outputTokens: 1 } };
    expect(validateOperatorRelayResponse(tampered, request)).toContain('responseHash does not match canonical relay response');
  });

  it('omits malformed usage instead of fabricating it, and the relay still completes', async () => {
    const request = relay();
    for (const usage of [undefined, null, { input_tokens: -1, output_tokens: 2 }, { input_tokens: 1.5, output_tokens: 2 }, { output_tokens: 2 }]) {
      const response = await anthropicAdapter(usage)(request);
      expect(response).not.toHaveProperty('usage');
      expect(response.status).toBe('completed');
      expect(validateOperatorRelayResponse(response, request)).toEqual([]);
    }
  });

  it('keeps the pre-usage response hash unchanged for receipts without usage', () => {
    const base: Omit<OperatorRelayResponseV1, 'responseHash'> = {
      contract: OPERATOR_RELAY_RESPONSE_CONTRACT,
      relayId: 'relay-usage-test',
      requestHash: 'a'.repeat(64),
      fromOperator: 'claude-code',
      toOperator: 'codex',
      status: 'completed',
      answer: 'measured answer',
      evidenceRefs: ['provider:anthropic:msg_usage'],
      unresolved: [],
      authorityRequested: 'none',
      completedAt: '2026-10-06T18:00:00.000Z',
    };
    // Golden value computed by operatorRelayResponseHash on main 8283095, before usage existed.
    expect(operatorRelayResponseHash(base)).toBe('3fa4a09ded7d5f5be2abc85252d3ae90457e6b24caaea0872beeefdb6146008b');
  });

  it('rejects usage counts that are not non-negative integers', async () => {
    const request = relay();
    const response = await anthropicAdapter({ input_tokens: 5, output_tokens: 5 })(request);
    const bad = { ...response, usage: { ...response.usage!, inputTokens: -5 } };
    const { responseHash: _ignored, ...identity } = bad;
    const rehashed = { ...bad, responseHash: operatorRelayResponseHash(identity) };
    expect(validateOperatorRelayResponse(rehashed, request)).toContain('relay usage inputTokens must be a non-negative integer');
  });
});

describe('council round usage ledger', () => {
  it('carries provider usage onto the persisted council hop', async () => {
    const { runCouncilRound } = await import('../councilRound.js');
    const adapter = anthropicAdapter({ input_tokens: 40, output_tokens: 9, cache_read_input_tokens: 0 });
    const rows: unknown[] = [];
    const result = await runCouncilRound({
      goal: 'Measure a council hop',
      initiator: 'fcr',
      sourceRef: 'chat:usage-test',
      seed: 'Measure what this relay hop costs.',
      seats: [{ operator: 'claude-code', capability: 'implement' }],
      sensitivity: 'internal',
      persist: async (row) => { rows.push(row); },
    }, { 'claude-code': adapter });
    expect(result.transcript.hops[0].usage).toEqual({
      provider: 'anthropic',
      inputTokens: 40,
      outputTokens: 9,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
    });
    expect(rows).toHaveLength(1);
  });
});
