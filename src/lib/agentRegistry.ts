/**
 * Canonical multitool registry for AI operators and model-provider identities
 * recognized by Founder Control Room.
 *
 * Operator capability is coordination authority only. It never creates
 * credentials, provider access, merge authority, deploy authority, or founder
 * approval. Runtime model providers remain a separate concern.
 */

export type AgentOperatorCapability = 'research' | 'propose' | 'review' | 'implement' | 'instruct';

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
const DEEPSEEK_INSTRUCTOR = 'docs/DEEPSEEK_INSTRUCTOR_CONTRACT.md';
const MUSE_CONTROL = '.control-room/MUSE.md';
const COUNCIL_CONTROL = '.control-room/COUNCIL.md';

export const AGENT_REGISTRY: readonly AgentDescriptor[] = [
  {
    id: 'gemini',
    label: 'Gemini Command',
    role: 'Foremost operational media authority for intake, interpretation, planning, routing, production review, and release disposition under the non-bypassable /LEEVIZE truth and policy kernel.',
    operator: {
      enabled: true,
      capabilities: ['research', 'propose', 'review', 'implement'],
      firstSliceRuntimeModel: false,
      externalWritesRequireBoundAuthority: true,
      instructionContracts: [FCR_V14, MULTI_AGENT],
    },
  },
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
    id: 'muse',
    label: 'Muse',
    role: 'Governed Founder AI Council challenger for cross-provider analysis, repository implementation, and GitHub/Supabase/Cloudflare drift detection under existing founder authority gates.',
    operator: {
      enabled: true,
      capabilities: ['research', 'propose', 'review', 'implement'],
      firstSliceRuntimeModel: false,
      externalWritesRequireBoundAuthority: true,
      instructionContracts: [MUSE_CONTROL, COUNCIL_CONTROL, FCR_V14, MULTI_AGENT],
    },
  },
  {
    id: 'deepseek-instructor',
    label: 'DeepSeek Instructor',
    role: 'Cross-project instruction, adversarial challenge, solution synthesis, and portable pattern extraction without direct implementation authority.',
    operator: {
      enabled: true,
      capabilities: ['research', 'propose', 'review', 'instruct'],
      firstSliceRuntimeModel: false,
      externalWritesRequireBoundAuthority: true,
      instructionContracts: [DEEPSEEK_INSTRUCTOR, FCR_V14, MULTI_AGENT],
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
    id: 'google-ai-platform',
    label: 'Google AI / Gemini Platform',
    role: 'Replaceable server-side Gemini model capability behind adapters; provider availability never grants truth, mutation, spend, render, or publish authority.',
  },
  {
    id: 'deepseek-platform',
    label: 'DeepSeek Platform',
    role: 'Replaceable server-side reasoning/model capability behind adapters; provider availability never grants operator or mutation authority.',
  },
  {
    id: 'meta-ai-platform',
    label: 'Meta AI / Muse Platform',
    role: 'Replaceable server-side Muse model capability behind adapters; provider availability, model capability, or Council membership never grants mutation or founder authority.',
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
