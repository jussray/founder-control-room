import { describe, expect, it } from 'vitest';
import {
  OPERATOR_RELAY_REQUEST_CONTRACT,
  OPERATOR_RELAY_RESPONSE_CONTRACT,
  operatorRelayRequestHash,
  operatorRelayResponseHash,
  relayContextFingerprint,
  type OperatorRelayRequestV1,
} from '../operatorRelay.js';
import { dispatchOperatorRelay, OperatorRelayDispatchError } from '../operatorRelayDispatch.js';

function request(): OperatorRelayRequestV1 {
  const summary = 'Relay a bounded adversarial review to Perplexity.';
  const sourceRef = 'chat:relay-dispatch-test';
  const base: Omit<OperatorRelayRequestV1, 'requestHash'> = {
    contract: OPERATOR_RELAY_REQUEST_CONTRACT,
    relayId: 'relay-dispatch-1',
    fromOperator: 'codex',
    toOperator: 'perplexity',
    capability: 'review',
    goal: 'Return an independent review to the source conversation.',
    context: { summary, sourceRef, sourceFingerprint: relayContextFingerprint(summary, sourceRef) },
    authority: { externalWrite: false, merge: false, deploy: false, publish: false, providerMutation: false },
    sensitivity: 'internal',
    createdAt: '2026-09-16T06:30:00.000Z',
    expiresAt: '2099-09-16T06:40:00.000Z',
  };
  return { ...base, requestHash: operatorRelayRequestHash(base) };
}

describe('dispatchOperatorRelay', () => {
  it('dispatches only to the explicitly requested adapter and validates its response', async () => {
    const req = request();
    let perplexityCalls = 0;
    let claudeCalls = 0;
    const result = await dispatchOperatorRelay(req, {
      perplexity: async (incoming) => {
        perplexityCalls += 1;
        const base = {
          contract: OPERATOR_RELAY_RESPONSE_CONTRACT,
          relayId: incoming.relayId,
          requestHash: incoming.requestHash,
          fromOperator: 'perplexity' as const,
          toOperator: 'codex' as const,
          status: 'completed' as const,
          answer: 'Independent review complete.',
          evidenceRefs: ['provider:perplexity:test'],
          unresolved: [],
          authorityRequested: 'none' as const,
          completedAt: '2026-09-16T06:31:00.000Z',
        };
        return { ...base, responseHash: operatorRelayResponseHash(base) };
      },
      'claude-code': async () => {
        claudeCalls += 1;
        throw new Error('wrong adapter');
      },
    }, Date.parse('2026-09-16T06:31:00.000Z'));

    expect(result.fromOperator).toBe('perplexity');
    expect(perplexityCalls).toBe(1);
    expect(claudeCalls).toBe(0);
  });

  it('fails closed instead of silently substituting another operator', async () => {
    await expect(dispatchOperatorRelay(request(), {
      'claude-code': async () => { throw new Error('must not be called'); },
    }, Date.parse('2026-09-16T06:31:00.000Z'))).rejects.toMatchObject<Partial<OperatorRelayDispatchError>>({
      code: 'relay_target_unavailable',
    });
  });

  it('rejects an unbound provider response', async () => {
    const req = request();
    await expect(dispatchOperatorRelay(req, {
      perplexity: async (incoming) => {
        const base = {
          contract: OPERATOR_RELAY_RESPONSE_CONTRACT,
          relayId: incoming.relayId,
          requestHash: '0'.repeat(64),
          fromOperator: 'perplexity' as const,
          toOperator: 'codex' as const,
          status: 'completed' as const,
          answer: 'tampered',
          evidenceRefs: [],
          unresolved: [],
          authorityRequested: 'none' as const,
          completedAt: '2026-09-16T06:31:00.000Z',
        };
        return { ...base, responseHash: operatorRelayResponseHash(base) };
      },
    }, Date.parse('2026-09-16T06:31:00.000Z'))).rejects.toMatchObject<Partial<OperatorRelayDispatchError>>({
      code: 'relay_response_invalid',
    });
  });
});
