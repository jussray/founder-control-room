import { describe, expect, it } from 'vitest';
import { authorizeOperatorRelay } from '../operatorRelayAuthz.js';
import type { OperatorRelayRequestV1 } from '../operatorRelay.js';

describe('authorizeOperatorRelay', () => {
  it('requires an authenticated session bound to the source operator', () => {
    const request = { fromOperator: 'codex' } as OperatorRelayRequestV1;
    expect(authorizeOperatorRelay({ authenticated: false, operator: 'codex' }, request)).toContain('relay requires authenticated founder session');
    expect(authorizeOperatorRelay({ authenticated: true, operator: 'perplexity' }, request)).toContain('relay source operator is not bound to current session');
    expect(authorizeOperatorRelay({ authenticated: true, operator: 'codex' }, request)).toEqual([]);
  });
});
