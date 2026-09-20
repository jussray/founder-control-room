import { describe, expect, it } from 'vitest';
import {
  OPERATOR_RELAY_REQUEST_CONTRACT,
  OPERATOR_RELAY_RESPONSE_CONTRACT,
  operatorRelayRequestHash,
  operatorRelayResponseHash,
  relayContextFingerprint,
  validateOperatorRelayRequest,
  validateOperatorRelayResponse,
  type OperatorRelayRequestV1,
  type OperatorRelayResponseV1,
} from '../operatorRelay.js';

const CREATED_AT = '2026-09-16T06:30:00.000Z';
const EXPIRES_AT = '2026-09-16T06:40:00.000Z';
const NOW = Date.parse('2026-09-16T06:31:00.000Z');

function request(overrides: Partial<OperatorRelayRequestV1> = {}): OperatorRelayRequestV1 {
  const summary = 'Attack the current ULTRATHINK bridge design and return only surviving defects.';
  const sourceRef = 'chat:ultrathink-bridge';
  const base: Omit<OperatorRelayRequestV1, 'requestHash'> = {
    contract: OPERATOR_RELAY_REQUEST_CONTRACT,
    relayId: 'relay-001',
    fromOperator: 'codex',
    toOperator: 'perplexity',
    capability: 'review',
    goal: 'Get an independent adversarial review without founder copy/paste.',
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
    createdAt: CREATED_AT,
    expiresAt: EXPIRES_AT,
  };
  const merged = { ...base, ...overrides } as Omit<OperatorRelayRequestV1, 'requestHash'>;
  return {
    ...merged,
    requestHash: operatorRelayRequestHash(merged),
  };
}

function response(req: OperatorRelayRequestV1, overrides: Partial<OperatorRelayResponseV1> = {}): OperatorRelayResponseV1 {
  const base: Omit<OperatorRelayResponseV1, 'responseHash'> = {
    contract: OPERATOR_RELAY_RESPONSE_CONTRACT,
    relayId: req.relayId,
    requestHash: req.requestHash,
    fromOperator: req.toOperator,
    toOperator: req.fromOperator,
    status: 'completed',
    answer: 'Subject-bound evidence is the strongest surviving requirement.',
    evidenceRefs: ['source:perplexity-review'],
    unresolved: [],
    authorityRequested: 'none',
    completedAt: '2026-09-16T06:32:00.000Z',
  };
  const merged = { ...base, ...overrides } as Omit<OperatorRelayResponseV1, 'responseHash'>;
  return {
    ...merged,
    responseHash: operatorRelayResponseHash(merged),
  };
}

describe('operator relay', () => {
  it('accepts a bounded ChatGPT to Perplexity review relay', () => {
    expect(validateOperatorRelayRequest(request(), NOW)).toEqual([]);
  });

  it('accepts Claude and ChatGPT as peer operator targets', () => {
    expect(validateOperatorRelayRequest(request({ toOperator: 'claude-code' }), NOW)).toEqual([]);
    expect(validateOperatorRelayRequest(request({ fromOperator: 'perplexity', toOperator: 'codex' }), NOW)).toEqual([]);
  });

  it('rejects DeepSeek from the peer operator relay', () => {
    const value = { ...request(), toOperator: 'deepseek-instructor' } as unknown as OperatorRelayRequestV1;
    expect(validateOperatorRelayRequest(value, NOW)).toContain('toOperator is unsupported');
  });

  it('rejects any mutation authority carried by the relay', () => {
    const value = request();
    value.authority.publish = true as false;
    expect(validateOperatorRelayRequest(value, NOW)).toContain('relay cannot carry mutation authority');
  });

  it('rejects context tampering after fingerprinting', () => {
    const value = request();
    value.context.summary = 'tampered';
    expect(validateOperatorRelayRequest(value, NOW)).toContain('sourceFingerprint does not match context');
  });

  it('binds the response back to the exact request and return operator', () => {
    const req = request();
    expect(validateOperatorRelayResponse(response(req), req)).toEqual([]);

    const wrong = response(req, { toOperator: 'claude-code' });
    expect(validateOperatorRelayResponse(wrong, req)).toContain('response must return to source operator');
  });
});
