import { describe, expect, it } from 'vitest';
import { relayContinuity } from '../operatorRelayContinuity.js';
import type { OperatorRelayRequestV1, OperatorRelayResponseV1 } from '../operatorRelay.js';

describe('relayContinuity', () => {
  it('keeps requested and responding operator identities visible', () => {
    const continuity = relayContinuity(
      { requestHash: 'a', context: { sourceFingerprint: 'subject' }, toOperator: 'perplexity' } as OperatorRelayRequestV1,
      { responseHash: 'b', fromOperator: 'perplexity' } as OperatorRelayResponseV1,
    );
    expect(continuity).toMatchObject({ requestedOperator: 'perplexity', respondingOperator: 'perplexity', subject: 'subject' });
  });
});
