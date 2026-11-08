import { describe, expect, it } from 'vitest';
import {
  OPERATOR_RELAY_REQUEST_CONTRACT,
  operatorRelayRequestHash,
  relayContextFingerprint,
  validateOperatorRelayResponse,
  type OperatorRelayRequestV1,
} from '../operatorRelay.js';
import { buildOperatorRelayResponse } from '../operatorRelayProviderResult.js';

function relay(): OperatorRelayRequestV1 {
  const summary = 'test';
  const base: Omit<OperatorRelayRequestV1, 'requestHash'> = {
    contract: OPERATOR_RELAY_REQUEST_CONTRACT,
    relayId: 'relay-provider-result',
    fromOperator: 'codex',
    toOperator: 'perplexity',
    capability: 'review',
    goal: 'test relay response binding',
    context: { summary, sourceRef: null, sourceFingerprint: relayContextFingerprint(summary) },
    authority: { externalWrite: false, merge: false, deploy: false, publish: false, providerMutation: false },
    sensitivity: 'public',
    createdAt: '2026-09-16T06:30:00.000Z',
    expiresAt: '2099-09-16T06:40:00.000Z',
  };
  return { ...base, requestHash: operatorRelayRequestHash(base) };
}

describe('buildOperatorRelayResponse', () => {
  it('returns a response bound to the exact relay request', () => {
    const request = relay();
    const response = buildOperatorRelayResponse(request, {
      answer: 'review complete',
      evidenceRefs: ['provider:perplexity:receipt'],
      completedAt: '2026-09-16T06:31:00.000Z',
    });
    expect(validateOperatorRelayResponse(response, request)).toEqual([]);
  });
});
