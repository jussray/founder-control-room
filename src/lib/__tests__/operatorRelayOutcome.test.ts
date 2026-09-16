import { describe, expect, it } from 'vitest';
import { relayOutcomeVerified } from '../operatorRelayOutcome.js';
import type { OperatorRelayRequestV1, OperatorRelayResponseV1 } from '../operatorRelay.js';

describe('relayOutcomeVerified', () => {
  it('requires exact responding operator, request binding, and provider evidence', () => {
    const request = { toOperator: 'perplexity', requestHash: 'r' } as OperatorRelayRequestV1;
    expect(relayOutcomeVerified(request, { status: 'completed', fromOperator: 'perplexity', requestHash: 'r', evidenceRefs: ['provider:1'] } as OperatorRelayResponseV1)).toBe(true);
    expect(relayOutcomeVerified(request, { status: 'completed', fromOperator: 'perplexity', requestHash: 'r', evidenceRefs: [] } as OperatorRelayResponseV1)).toBe(false);
  });
});
