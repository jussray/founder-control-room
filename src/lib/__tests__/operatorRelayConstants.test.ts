import { describe, expect, it } from 'vitest';
import { agentOperatorPolicy } from '../agentRegistry.js';
import { OPERATOR_RELAY_INSTRUCTOR, OPERATOR_RELAY_PEERS } from '../operatorRelayConstants.js';

describe('operator relay lanes', () => {
  it('keeps the four governed peer operators in one canonical lane', () => {
    expect(OPERATOR_RELAY_PEERS).toEqual(['gemini', 'codex', 'claude-code', 'perplexity']);
  });

  it('keeps every canonical peer enabled for bounded relay work', () => {
    for (const peer of OPERATOR_RELAY_PEERS) {
      const policy = agentOperatorPolicy(peer);
      expect(policy?.enabled).toBe(true);
      expect(policy?.capabilities).toEqual(expect.arrayContaining([
        'research',
        'propose',
        'review',
        'implement',
      ]));
    }
  });

  it('keeps DeepSeek outside the peer operator lane', () => {
    expect(OPERATOR_RELAY_PEERS).not.toContain(OPERATOR_RELAY_INSTRUCTOR as never);
  });
});
