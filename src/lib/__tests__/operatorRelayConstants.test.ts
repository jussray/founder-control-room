import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { agentOperatorPolicy } from '../agentRegistry.js';
import { OPERATOR_RELAY_INSTRUCTOR, OPERATOR_RELAY_PEERS } from '../operatorRelayConstants.js';

const relayFacingDocs = [
  new URL('../../../docs/OPERATOR_RELAY_CONTRACT.md', import.meta.url),
  new URL('../../../docs/OPERATOR_RELAY_STATUS.md', import.meta.url),
];

describe('operator relay lanes', () => {
  it('keeps the six governed peer operators in one canonical lane', () => {
    expect(OPERATOR_RELAY_PEERS).toEqual(['gemini', 'codex', 'claude-code', 'perplexity', 'meta-ai', 'muse']);
  });

  it('keeps every canonical peer enabled for bounded relay work', () => {
    for (const peer of OPERATOR_RELAY_PEERS) {
      const policy = agentOperatorPolicy(peer);
      expect(policy?.enabled).toBe(true);
      expect(policy?.capabilities).toEqual(expect.arrayContaining([
        'research', 'propose', 'review',
      ]));
    }
  });

  it('keeps Meta AI non-implementing while established build peers retain implementation capability', () => {
    expect(agentOperatorPolicy('meta-ai')?.capabilities).not.toContain('implement');
    for (const peer of OPERATOR_RELAY_PEERS.filter((peer) => peer !== 'meta-ai')) {
      expect(agentOperatorPolicy(peer)?.capabilities).toContain('implement');
    }
  });

  it('keeps DeepSeek exclusively in the instructor lane', () => {
    expect(OPERATOR_RELAY_PEERS).not.toContain('deepseek' as never);
    expect(OPERATOR_RELAY_PEERS).not.toContain(OPERATOR_RELAY_INSTRUCTOR as never);
    expect(agentOperatorPolicy('deepseek')).toBeNull();
    const instructor = agentOperatorPolicy(OPERATOR_RELAY_INSTRUCTOR);
    expect(instructor?.enabled).toBe(true);
    expect(instructor?.capabilities).toContain('instruct');
    expect(instructor?.capabilities).not.toContain('implement');
  });

  it('keeps relay-facing governance docs aligned with the canonical peer registry', () => {
    for (const docUrl of relayFacingDocs) {
      const contents = readFileSync(docUrl, 'utf8');
      for (const peer of OPERATOR_RELAY_PEERS) {
        expect(contents, `${docUrl.pathname} is missing canonical peer ${peer}`).toContain(`\`${peer}\``);
      }
      expect(contents).toMatch(/deepseek-instructor|DeepSeek.*Instructor/i);
    }
  });
});
