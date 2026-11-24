import { describe, expect, it } from 'vitest';
import { relayClaim } from '../operatorRelayClaims.js';
import type { OperatorRelayRequestV1, OperatorRelayResponseV1 } from '../operatorRelay.js';

describe('relayClaim', () => {
  it('names the operator and exact request/response identities', () => {
    expect(relayClaim({ toOperator: 'perplexity', relayId: 'r1', requestHash: 'rq' } as OperatorRelayRequestV1, { responseHash: 'rs' } as OperatorRelayResponseV1)).toContain('perplexity answered relay r1');
  });
});
