import { describe, expect, it } from 'vitest';
import {
  AGENT_REGISTRY,
  agentCanOperate,
  agentOperatorPolicy,
} from '../agentRegistry.js';

describe('FCR governed agent enablement', () => {
  it.each(['claude-code', 'codex', 'perplexity'])('%s is enabled as a bounded operator', (agentId) => {
    const policy = agentOperatorPolicy(agentId);

    expect(policy).not.toBeNull();
    expect(policy?.enabled).toBe(true);
    expect(policy?.externalWritesRequireBoundAuthority).toBe(true);
    expect(policy?.firstSliceRuntimeModel).toBe(false);
    expect(policy?.capabilities).toEqual(expect.arrayContaining(['research', 'propose', 'review', 'implement']));
  });

  it('keeps model-provider identities separate from operator enablement', () => {
    expect(agentOperatorPolicy('anthropic-platform')).toBeNull();
    expect(agentOperatorPolicy('openai-platform')).toBeNull();
  });

  it('does not permit an unknown agent to operate', () => {
    expect(agentCanOperate('unknown-agent', 'implement')).toBe(false);
  });

  it('binds Claude and Perplexity to their provider-specific instruction contracts', () => {
    const claude = AGENT_REGISTRY.find((agent) => agent.id === 'claude-code');
    const perplexity = AGENT_REGISTRY.find((agent) => agent.id === 'perplexity');

    expect(claude?.operator?.instructionContracts).toContain('CLAUDE.md');
    expect(perplexity?.operator?.instructionContracts).toContain('PERPLEXITY.md');
    expect(claude?.operator?.instructionContracts).toContain('docs/FCR_MULTI_AGENT_ENABLEMENT_CONTRACT.md');
    expect(perplexity?.operator?.instructionContracts).toContain('docs/FCR_MULTI_AGENT_ENABLEMENT_CONTRACT.md');
  });
});
