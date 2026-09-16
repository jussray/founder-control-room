import { describe, expect, it } from 'vitest';
import { redteamRelayPair } from '../operatorRelayRedteam.js';
import type { OperatorRelayRequestV1, OperatorRelayResponseV1 } from '../operatorRelay.js';

describe('redteamRelayPair', () => {
  it('catches silent provider substitution', () => {
    const request = { fromOperator: 'codex', toOperator: 'perplexity', requestHash: 'a'.repeat(64) } as OperatorRelayRequestV1;
    const response = { fromOperator: 'claude-code', toOperator: 'codex', requestHash: 'a'.repeat(64), status: 'completed', evidenceRefs: ['provider:x'] } as OperatorRelayResponseV1;
    expect(redteamRelayPair(request, response)).toContain('operator substitution detected');
  });
});
