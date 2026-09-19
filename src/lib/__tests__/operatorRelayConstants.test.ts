import { describe, expect, it } from 'vitest';
import { OPERATOR_RELAY_INSTRUCTOR, OPERATOR_RELAY_PEERS } from '../operatorRelayConstants.js';

describe('operator relay lanes', () => {
  it('keeps DeepSeek outside the peer operator lane', () => {
    expect(OPERATOR_RELAY_PEERS).toEqual(['codex', 'claude-code', 'perplexity']);
    expect(OPERATOR_RELAY_PEERS).not.toContain(OPERATOR_RELAY_INSTRUCTOR as never);
  });
});
