/**
 * Canonical multitool registry — mirrors the "Provider roles" section of
 * GLOBAL_AI.md. This is the single source of truth for which AI tools this
 * Control Room recognizes and what each is for.
 *
 * Operator capability is coordination authority only. It never creates
 * credentials, provider access, merge authority, deploy authority, or founder
 * approval. Runtime model providers remain a separate concern.
 */

export type AgentOperatorCapability = 'research' | 'propose' | 'review' | 'implement';

export interface AgentOperatorPolicy {
  enabled: boolean;
  capabilities: readonly AgentOperatorCapability[];
  firstSliceRuntimeModel: false;
  externalWritesRequireBoundAuthority: true;
  instructionContracts: readonly string[];
}

export interface AgentDescriptor {
  id: string;
  label: string;
  role: string;
  operator?: AgentOperatorPolicy;
}

const FCR_V14 = 'docs/FOUNDER_CONTROL_ROOM_AND_CHIEF_AI_MASTER_BUILD_SPEC_V1_4_ADDENDUM.md';
const MULTI_AGENT = 'docs/FCR_MULTI_AGENT_ENABLEMENT_CONTRACT.md';

export const AGENT_REGISTRY: readonly AgentDescriptor[] = [
  {
    id: 'claude-code',
    label: 'Claude / Claude Code',
    role: 'Long-context repository analysis, structured implementation, careful refactors, and documentation.',
    operator: {
      enabled: true,
      capabilities: ['research', 'propose', 'review', 'implement'],
      firstSliceRuntimeModel: false,
      externalWritesRequireBoundAuthority: true,
      instructionContracts: ['CLAUDE.md', 'docs/CLAUDE_FOUNDER_CONTROL_ROOM_MASTER_BUILD_SPEC.md', FCR_V14, MULTI_AGENT],
    },
  },
  {
    id: 'codex',
    label: 'Codex / ChatGPT',
    role: 'Debugging, code review, data analysis, repository operations, and founder-readable synthesis.',
    operator: {
      enabled: true,
      capabilities: ['research', 'propose', 'review', 'implement'],
      firstSliceRuntimeModel: false,
      externalWritesRequireBoundAuthority: true,
      instructionContracts: ['AGENTS.md', 'GLOBAL_AI.md', FCR_V14, MULTI_AGENT],
    },
  },
  {
    id: 'openai-platform',
    label: 'OpenAI Platform',
    role: 'Replaceable server-side model capability behind adapters; never client-side keys.',
  },
  {
    id: 'anthropic-platform',
    label: 'Anthropic Platform',
    role: 'Replaceable server-side model capability behind adapters; model context is not durable memory.',
  },
  {
    id: 'perplexity',
    label: 'Perplexity',
    role: 'Current public research, source validation, adversarial verification, and bounded implementation when separately authorized.',
    operator: {
      enabled: true,
      capabilities: ['research', 'propose', 'review', 'implement'],
      firstSliceRuntimeModel: false,
      externalWritesRequireBoundAuthority: true,
      instructionContracts: ['PERPLEXITY.md', 'docs/PERPLEXITY_MCP_FOUNDER_CONTROL_ROOM_MASTER_BUILD_SPEC.md', FCR_V14, MULTI_AGENT],
    },
  },
  { id: 'github', label: 'GitHub', role: 'Source control, review, CI evidence, and provenance; a merge is not proof of deployment.' },
  { id: 'supabase', label: 'Supabase', role: "Control Room authentication and operational storage within this project's own trust boundary." },
];

export const AGENT_IDS: ReadonlySet<string> = new Set(AGENT_REGISTRY.map((agent) => agent.id));

export function agentOperatorPolicy(agentId: string): AgentOperatorPolicy | null {
  return AGENT_REGISTRY.find((agent) => agent.id === agentId)?.operator ?? null;
}

export function agentCanOperate(agentId: string, capability: AgentOperatorCapability): boolean {
  const policy = agentOperatorPolicy(agentId);
  return Boolean(policy?.enabled && policy.capabilities.includes(capability));
}
