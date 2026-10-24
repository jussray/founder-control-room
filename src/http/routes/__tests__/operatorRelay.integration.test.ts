import { describe, expect, it } from 'vitest';
import {
  OPERATOR_RELAY_REQUEST_CONTRACT,
  operatorRelayRequestHash,
  relayContextFingerprint,
  validateOperatorRelayRequest,
  type OperatorRelayRequestV1,
} from '../../../lib/operatorRelay.js';

function relay(toOperator: OperatorRelayRequestV1['toOperator']): OperatorRelayRequestV1 {
  const summary = 'Relay this bounded review to another governed operator and return its response to FCR.';
  const sourceRef = 'fcr:operator-relay:e2e';
  const base: Omit<OperatorRelayRequestV1, 'requestHash'> = {
    contract: OPERATOR_RELAY_REQUEST_CONTRACT,
    relayId: `relay-${toOperator}`,
    fromOperator: 'codex',
    toOperator,
    capability: 'review',
    goal: 'Prove FCR can address a peer operator without transferring mutation authority.',
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
    createdAt: '2026-09-16T06:30:00.000Z',
    expiresAt: '2099-09-16T06:40:00.000Z',
  };
  return { ...base, requestHash: operatorRelayRequestHash(base) };
}

describe('operator relay route contract', () => {
  it.each(['perplexity', 'claude-code'] as const)('keeps %s in the peer-operator lane', (toOperator) => {
    expect(validateOperatorRelayRequest(relay(toOperator), Date.parse('2026-09-16T06:31:00.000Z'))).toEqual([]);
  });
});
