import { describe, expect, it } from 'vitest';
import {
  AGENT_REGISTRY,
  MODEL_EXECUTION_PROFILES,
  agentCanOperate,
  agentOperatorPolicy,
  modelExecutionProfile,
  modelExecutionProfileForOperator,
} from '../agentRegistry.js';

describe('FCR governed agent enablement', () => {
  it.each(['gemini', 'claude-code', 'codex', 'muse', 'deepseek', 'perplexity'])('%s is enabled as a bounded implementation-capable operator', (agentId) => {
    const policy = agentOperatorPolicy(agentId);

    expect(policy).not.toBeNull();
    expect(policy?.enabled).toBe(true);
    expect(policy?.externalWritesRequireBoundAuthority).toBe(true);
    expect(policy?.firstSliceRuntimeModel).toBe(false);
    expect(policy?.capabilities).toEqual(expect.arrayContaining(['research', 'propose', 'review', 'implement']));
  });

  it('enables DeepSeek as an instructor without implementation authority', () => {
    const policy = agentOperatorPolicy('deepseek-instructor');

    expect(policy).not.toBeNull();
    expect(policy?.enabled).toBe(true);
    expect(policy?.externalWritesRequireBoundAuthority).toBe(true);
    expect(policy?.firstSliceRuntimeModel).toBe(false);
    expect(policy?.capabilities).toEqual(expect.arrayContaining(['research', 'propose', 'review', 'instruct']));
    expect(policy?.capabilities).not.toContain('implement');
    expect(agentCanOperate('deepseek-instructor', 'implement')).toBe(false);
  });

  it('keeps model-provider identities separate from operator enablement', () => {
    expect(agentOperatorPolicy('anthropic-platform')).toBeNull();
    expect(agentOperatorPolicy('openai-platform')).toBeNull();
    expect(agentOperatorPolicy('google-ai-platform')).toBeNull();
    expect(agentOperatorPolicy('deepseek-platform')).toBeNull();
    expect(agentOperatorPolicy('meta-ai-platform')).toBeNull();
  });

  it('does not permit an unknown agent to operate', () => {
    expect(agentCanOperate('unknown-agent', 'implement')).toBe(false);
  });

  it('binds provider-specific operators to their instruction contracts', () => {
    const gemini = AGENT_REGISTRY.find((agent) => agent.id === 'gemini');
    const claude = AGENT_REGISTRY.find((agent) => agent.id === 'claude-code');
    const codex = AGENT_REGISTRY.find((agent) => agent.id === 'codex');
    const muse = AGENT_REGISTRY.find((agent) => agent.id === 'muse');
    const perplexity = AGENT_REGISTRY.find((agent) => agent.id === 'perplexity');
    const deepseek = AGENT_REGISTRY.find((agent) => agent.id === 'deepseek-instructor');

    expect(gemini?.operator?.instructionContracts).toContain('docs/FCR_MULTI_AGENT_ENABLEMENT_CONTRACT.md');
    expect(claude?.operator?.instructionContracts).toContain('CLAUDE.md');
    expect(claude?.operator?.instructionContracts).toContain('docs/MODEL_NATIVE_EXECUTION_PROFILES.md');
    expect(codex?.operator?.instructionContracts).toContain('docs/MODEL_NATIVE_EXECUTION_PROFILES.md');
    expect(muse?.operator?.instructionContracts).toContain('.control-room/MUSE.md');
    expect(muse?.operator?.instructionContracts).toContain('.control-room/COUNCIL.md');
    expect(muse?.operator?.instructionContracts).toContain('docs/FCR_MULTI_AGENT_ENABLEMENT_CONTRACT.md');
    expect(perplexity?.operator?.instructionContracts).toContain('PERPLEXITY.md');
    expect(deepseek?.operator?.instructionContracts).toContain('docs/DEEPSEEK_INSTRUCTOR_CONTRACT.md');
    expect(claude?.operator?.instructionContracts).toContain('docs/FCR_MULTI_AGENT_ENABLEMENT_CONTRACT.md');
    expect(perplexity?.operator?.instructionContracts).toContain('docs/FCR_MULTI_AGENT_ENABLEMENT_CONTRACT.md');
    expect(deepseek?.operator?.instructionContracts).toContain('docs/FCR_MULTI_AGENT_ENABLEMENT_CONTRACT.md');
  });

  it('lets Sol and Claude adapt execution without adapting truth or authority', () => {
    const sol = modelExecutionProfile('chatgpt-sol');
    const claude = modelExecutionProfile('claude-code');

    expect(MODEL_EXECUTION_PROFILES).toHaveLength(2);
    expect(sol.executionBias).not.toEqual(claude.executionBias);
    expect(sol.mayAdapt).toEqual(claude.mayAdapt);
    expect(sol.mayNotAdapt).toEqual(claude.mayNotAdapt);
    expect(sol.mayNotAdapt).toEqual(expect.arrayContaining([
      'truth-state',
      'authority-state',
      'founder-approval',
      'proof-state',
      'project-canon',
    ]));
    expect(sol.mayAdapt.some((field) => sol.mayNotAdapt.includes(field))).toBe(false);
    expect(claude.mayAdapt.some((field) => claude.mayNotAdapt.includes(field))).toBe(false);
    expect(sol.truthSource).toBe('shared-evidence-spine');
    expect(claude.truthSource).toBe('shared-evidence-spine');
    expect(sol.acceptsModelConsensusAsProof).toBe(false);
    expect(claude.acceptsModelConsensusAsProof).toBe(false);
    expect(sol.requiresIndependentEvidenceForTruthUpgrade).toBe(true);
    expect(claude.requiresIndependentEvidenceForTruthUpgrade).toBe(true);
  });

  it('requires runtime identity and tool availability to be observed per run', () => {
    for (const profile of MODEL_EXECUTION_PROFILES) {
      expect(profile.runtimeIdentitySource).toBe('observe-per-run');
      expect(profile.toolAvailabilitySource).toBe('observe-per-run');
      expect(profile.handoffFields).toEqual(expect.arrayContaining([
        'observedRuntimeModel',
        'observedCapabilities',
        'sourceTruthRefs',
        'authorityRequired',
        'proofRequired',
        'continuityFingerprint',
        'resultEvidence',
      ]));
    }

    expect(modelExecutionProfileForOperator('codex')?.id).toBe('chatgpt-sol');
    expect(modelExecutionProfileForOperator('claude-code')?.id).toBe('claude-code');
    expect(modelExecutionProfileForOperator('unknown')).toBeNull();
  });
});
