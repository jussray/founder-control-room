/**
 * Canonical multitool registry — mirrors the "Provider roles" section of
 * GLOBAL_AI.md. This is the single source of truth for which AI tools this
 * Control Room recognizes and what each is for; keep it in sync with that
 * doc by hand, the same way docs/ARCHITECTURE.md and this code agree on
 * RepositoryProvider.
 *
 * This is a reference registry for founder-facing coordination and
 * bookkeeping (mission agent assignment, Agent Council participants, cost
 * attribution) — it does not call any of these providers. Nothing here
 * holds or requires a credential.
 */

export interface AgentDescriptor {
  id: string;
  label: string;
  role: string;
}

export const AGENT_REGISTRY: readonly AgentDescriptor[] = [
  { id: 'claude-code', label: 'Claude / Claude Code', role: 'Long-context repository analysis, structured implementation, careful refactors, and documentation.' },
  { id: 'codex', label: 'Codex / ChatGPT', role: 'Debugging, code review, data analysis, repository operations, and founder-readable synthesis.' },
  { id: 'openai-platform', label: 'OpenAI Platform', role: 'Replaceable server-side model capability behind adapters; never client-side keys.' },
  { id: 'anthropic-platform', label: 'Anthropic Platform', role: 'Replaceable server-side model capability behind adapters; model context is not durable memory.' },
  { id: 'perplexity', label: 'Perplexity', role: 'Current public research and source discovery, not private runtime truth.' },
  { id: 'github', label: 'GitHub', role: 'Source control, review, CI evidence, and provenance; a merge is not proof of deployment.' },
  { id: 'supabase', label: 'Supabase', role: "Control Room authentication and operational storage within this project's own trust boundary." },
];

export const AGENT_IDS: ReadonlySet<string> = new Set(AGENT_REGISTRY.map((a) => a.id));
