# Operator Relay Status

Current classification: PARTIAL

Verified in authoritative FCR source and the focused relay repair line:

- peer-operator contract for `gemini`, `codex`, `claude-code`, and `perplexity`;
- explicit exclusion of `deepseek-instructor` from the peer lane;
- zero-authority relay envelope for research, propose, review, and bounded implementation work;
- semantic peer-review provider spend is currently fail-closed by founder cost-control policy before any provider dispatch;
- source-context fingerprinting and exact request/response hash binding;
- fail-closed dispatch when the requested operator is unavailable;
- canonical `/mcp` OAuth route mounted through the FCR MCP router with server-owned project scope, OAuth client mapping, founder allowlist checks, and redacted evidence receipts;
- static-token compatibility clients cannot use peer relay;
- exact-provider adapters for Gemini GenerateContent, OpenAI Responses, Anthropic Messages, and the Perplexity Agent API exist only when both an explicit model and server-held key are configured;
- provider timeouts are bounded and successful response bodies are size-bounded before parsing;
- provider error bodies and transport exception details are never promoted into application exceptions;
- secret-looking outbound relay context is rejected before provider serialization;
- provider/model provenance is constructed server-side from configured provider and model identity plus a sanitized response ID, never from model-returned identity fields;
- provider responses cannot grant mutation, merge, deploy, publish, or provider-mutation authority;
- transport resolution order is provider API -> remote MCP handoff -> local MCP handoff -> user-authorized interactive browser handoff -> unavailable;
- Gemini, OpenAI, Anthropic, and Perplexity handoff flags have separate provider namespaces and cannot silently fall through to another provider's handoff configuration;
- non-API handoffs remain `blocked` until a real peer response is returned against the exact request hash;
- DeepSeek remains on its separate Instructor contract and is never a peer relay target;
- exact current-main CI/check evidence exists independently of older relay preflight receipts.

The standalone `/api/operator-relay` router remains an unmounted test scaffold. It is not the canonical authority path and must not be mounted merely to create a second relay surface. The authenticated `/mcp` tool is the authoritative relay entry point.

Still not proven by source code alone:

- deployed OAuth client-to-operator mapping;
- deployed provider key/model configuration;
- a successful live Gemini, OpenAI, Anthropic, or Perplexity provider response receipt from deployed FCR;
- provider/runtime evidence proving which requested operator and configured model actually answered on the deployed path;
- user-authorized browser connection for an interactive fallback;
- a real ChatGPT/Codex -> FCR -> peer -> FCR -> ChatGPT/Codex round trip;
- a browser/Playwright round trip from founder-issued relay intent through FCR to the requested provider and back;
- same-head deployed runtime identity for that live round trip.

Current repository-level continuity debt is tracked separately from relay correctness. A stale or conflicting PR graph must not be treated as proof that focused relay code failed, but it does block integration until the candidate is rolled onto the current authority tree and exact-head proof is reacquired.

Provider configuration or a green source test cannot substitute for live receipts. Do not label the bridge VERIFIED until exact-head source gates, deployed runtime identity, and the applicable real peer/Playwright round-trip agree on the same exact subject.
