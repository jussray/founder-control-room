import { describe, expect, it } from 'vitest';
import { buildOperatorRelayReceipt } from '../operatorRelayReceipt.js';
import type { OperatorRelayRequestV1, OperatorRelayResponseV1 } from '../operatorRelay.js';

describe('buildOperatorRelayReceipt', () => {
  it('rejects a receipt when the responder is not the requested operator', () => {
    const request = { relayId: 'r', requestHash: 'a'.repeat(64), toOperator: 'perplexity' } as OperatorRelayRequestV1;
    const response = { fromOperator: 'claude-code', responseHash: 'b'.repeat(64), completedAt: '2026-09-16T06:31:00Z' } as OperatorRelayResponseV1;
    expect(() => buildOperatorRelayReceipt(request, response, 'provider:receipt')).toThrow('relay receipt operator mismatch');
  });
});
