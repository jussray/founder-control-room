import { describe, expect, it } from 'vitest';
import { relayOutcomeVerified } from '../operatorRelayOutcome.js';
import type { OperatorRelayRequestV1, OperatorRelayResponseV1 } from '../operatorRelay.js';

describe('relayOutcomeVerified', () => {
  it('requires exact responding operator, request binding, and provider evidence', () => {
    const request = { toOperator: 'perplexity', requestHash: 'r' } as unknown as OperatorRelayRequestV1;
    const evidenced = { status: 'completed', fromOperator: 'perplexity', requestHash: 'r', evidenceRefs: ['provider:1'] } as unknown as OperatorRelayResponseV1;
    const unevidenced = { status: 'completed', fromOperator: 'perplexity', requestHash: 'r', evidenceRefs: [] } as unknown as OperatorRelayResponseV1;
    expect(relayOutcomeVerified(request, evidenced)).toBe(true);
    expect(relayOutcomeVerified(request, unevidenced)).toBe(false);
  });
});
