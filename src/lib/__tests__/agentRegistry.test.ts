import { describe, expect, it } from 'vitest';
import {
  AGENT_REGISTRY,
  SEMANTIC_PEER_REVIEW_MODE,
  agentCanOperate,
  agentOperatorPolicy,
} from '../agentRegistry.js';

describe('FCR governed agent enablement', () => {
  it.each(['gemini', 'claude-code', 'codex', 'perplexity'])('%s stays enabled for bounded keyed work while peer review is paused', (agentId) => {
    const policy = agentOperatorPolicy(agentId);

    expect(policy).not.toBeNull();
    expect(policy?.enabled).toBe(true);
    expect(policy?.externalWritesRequireBoundAuthority).toBe(true);
    expect(policy?.firstSliceRuntimeModel).toBe(false);
    expect(policy?.capabilities).toEqual(expect.arrayContaining(['research', 'propose', 'implement']));
    expect(policy?.capabilities).not.toContain('review');
    expect(agentCanOperate(agentId, 'review')).toBe(false);
    expect(agentCanOperate(agentId, 'implement')).toBe(true);
  });

  it('pauses semantic peer review without weakening deterministic verification', () => {
    expect(SEMANTIC_PEER_REVIEW_MODE).toBe('paused');
    for (const agentId of ['gemini', 'claude-code', 'codex', 'perplexity', 'deepseek-instructor']) {
      expect(agentCanOperate(agentId, 'review')).toBe(false);
    }
  });

  it('enables DeepSeek as an instructor without implementation or peer-review authority', () => {
    const policy = agentOperatorPolicy('deepseek-instructor');

    expect(policy).not.toBeNull();
    expect(policy?.enabled).toBe(true);
    expect(policy?.externalWritesRequireBoundAuthority).toBe(true);
    expect(policy?.firstSliceRuntimeModel).toBe(false);
    expect(policy?.capabilities).toEqual(expect.arrayContaining(['research', 'propose', 'instruct']));
    expect(policy?.capabilities).not.toContain('review');
    expect(policy?.capabilities).not.toContain('implement');
    expect(agentCanOperate('deepseek-instructor', 'review')).toBe(false);
    expect(agentCanOperate('deepseek-instructor', 'implement')).toBe(false);
  });

  it('keeps model-provider identities separate from operator enablement', () => {
    expect(agentOperatorPolicy('anthropic-platform')).toBeNull();
    expect(agentOperatorPolicy('openai-platform')).toBeNull();
    expect(agentOperatorPolicy('google-ai-platform')).toBeNull();
    expect(agentOperatorPolicy('deepseek-platform')).toBeNull();
  });

  it('does not permit an unknown agent to operate', () => {
    expect(agentCanOperate('unknown-agent', 'implement')).toBe(false);
  });

  it('binds provider-specific operators to their instruction contracts', () => {
    const gemini = AGENT_REGISTRY.find((agent) => agent.id === 'gemini');
    const claude = AGENT_REGISTRY.find((agent) => agent.id === 'claude-code');
    const perplexity = AGENT_REGISTRY.find((agent) => agent.id === 'perplexity');
    const deepseek = AGENT_REGISTRY.find((agent) => agent.id === 'deepseek-instructor');

    expect(gemini?.operator?.instructionContracts).toContain('docs/FCR_MULTI_AGENT_ENABLEMENT_CONTRACT.md');
    expect(claude?.operator?.instructionContracts).toContain('CLAUDE.md');
    expect(perplexity?.operator?.instructionContracts).toContain('PERPLEXITY.md');
    expect(deepseek?.operator?.instructionContracts).toContain('docs/DEEPSEEK_INSTRUCTOR_CONTRACT.md');
    expect(claude?.operator?.instructionContracts).toContain('docs/FCR_MULTI_AGENT_ENABLEMENT_CONTRACT.md');
    expect(perplexity?.operator?.instructionContracts).toContain('docs/FCR_MULTI_AGENT_ENABLEMENT_CONTRACT.md');
    expect(deepseek?.operator?.instructionContracts).toContain('docs/FCR_MULTI_AGENT_ENABLEMENT_CONTRACT.md');
  });
});
