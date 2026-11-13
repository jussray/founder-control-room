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
  it('allows public and internal relay without broadening mutation authority', () => {
    for (const sensitivity of ['public', 'internal'] as const) {
      const request = {
        fromOperator: 'codex',
        toOperator: 'perplexity',
        sensitivity,
        authority: { externalWrite: false, merge: false, deploy: false, publish: false, providerMutation: false },
      } as OperatorRelayRequestV1;
      expect(relayMayDispatch(request)).toBe(true);
    }
  });

  it('denies restricted relay and malformed or extra authority fields', () => {
    const base = {
      fromOperator: 'codex',
      toOperator: 'perplexity',
      sensitivity: 'restricted',
      authority: { externalWrite: false, merge: false, deploy: false, publish: false, providerMutation: false },
    };
    expect(relayMayDispatch(base as OperatorRelayRequestV1)).toBe(false);
    expect(relayMayDispatch({ ...base, sensitivity: 'internal', authority: undefined } as unknown as OperatorRelayRequestV1)).toBe(false);
    expect(relayMayDispatch({ ...base, sensitivity: 'internal', authority: { ...base.authority, unexpected: false } } as unknown as OperatorRelayRequestV1)).toBe(false);
    expect(relayMayDispatch({ ...base, sensitivity: 'internal', authority: { ...base.authority, publish: true } } as unknown as OperatorRelayRequestV1)).toBe(false);
  });

});
