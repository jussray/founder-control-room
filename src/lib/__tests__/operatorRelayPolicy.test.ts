import { describe, expect, it } from 'vitest';
import { relayMayDispatch } from '../operatorRelayPolicy.js';
import type { OperatorRelayRequestV1 } from '../operatorRelay.js';

describe('relayMayDispatch', () => {
  it('rejects any authority-bearing relay', () => {
    const request = {
      fromOperator: 'codex',
      toOperator: 'perplexity',
      authority: { externalWrite: false, merge: false, deploy: false, publish: true, providerMutation: false },
    } as unknown as OperatorRelayRequestV1;
    expect(relayMayDispatch(request)).toBe(false);
  });
});
