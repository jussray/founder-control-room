import { describe, expect, it } from 'vitest';
import { AGENT_REGISTRY, agentCanOperate } from './agentRegistry.js';

const CHANGE_GENEALOGY = 'docs/AI_CHANGE_GENEALOGY_CONTRACT.md';

const EXPECTED_OPERATORS = [
  'gemini',
  'claude-code',
  'codex',
  'muse',
  'deepseek-instructor',
  'perplexity',
] as const;

describe('agent change genealogy inheritance', () => {
  it('binds every enabled AI operator to the canonical genealogy contract', () => {
    const operators = AGENT_REGISTRY.filter((agent) => agent.operator?.enabled);
    expect(operators.map((agent) => agent.id).sort()).toEqual([...EXPECTED_OPERATORS].sort());

    for (const agent of operators) {
      expect(agent.operator?.instructionContracts).toContain(CHANGE_GENEALOGY);
    }
  });

  it('preserves provider-specific authority ceilings instead of flattening every AI into one role', () => {
    expect(agentCanOperate('gemini', 'implement')).toBe(true);
    expect(agentCanOperate('claude-code', 'implement')).toBe(true);
    expect(agentCanOperate('codex', 'implement')).toBe(true);
    expect(agentCanOperate('muse', 'implement')).toBe(true);
    expect(agentCanOperate('perplexity', 'implement')).toBe(true);

    expect(agentCanOperate('deepseek-instructor', 'instruct')).toBe(true);
    expect(agentCanOperate('deepseek-instructor', 'implement')).toBe(false);
  });
});
