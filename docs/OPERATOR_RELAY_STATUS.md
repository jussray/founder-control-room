# Operator Relay Status

Current classification: PARTIAL

Implemented on the focused relay repair line:

- peer-operator contract for `codex`, `claude-code`, and `perplexity`;
- explicit exclusion of `deepseek-instructor` from the peer lane;
- zero-authority relay envelope;
- source-context fingerprinting and request/response hash binding;
- authenticated remote MCP tool `fcr_relay_operator` limited to research, propose, and review;
- exact-provider adapters for OpenAI Responses, Anthropic Messages, and Perplexity Responses-compatible Agent API;
- bounded provider timeouts and response bodies;
- provider error bodies never surfaced into application exceptions;
- secret-looking outbound relay context rejected before provider serialization;
- provider/model provenance constructed server-side rather than from model output;
- transport resolution order: provider API -> remote MCP handoff -> local MCP handoff -> user-authorized interactive browser handoff -> unavailable;
- non-API handoffs remain `blocked` until a real peer response is returned against the exact request hash;
- DeepSeek remains on its separate Instructor contract and is never a peer relay target.

Still not proven by source code alone:

- deployed OAuth client-to-operator mapping;
- deployed provider key/model configuration;
- live OpenAI, Anthropic, or Perplexity provider response receipt;
- user-authorized browser connection for the interactive Perplexity fallback;
- a real ChatGPT/Codex -> FCR -> peer -> FCR -> ChatGPT/Codex round trip;
- deployed runtime identity matching the exact candidate head.

Current known repository-level continuity debt is tracked separately from relay correctness. A stale or conflicting PR graph must not be treated as proof that this relay head itself failed its focused tests.

Do not label the bridge VERIFIED until exact-head source gates, deployed runtime identity, and at least one real peer round-trip agree on the same subject.
