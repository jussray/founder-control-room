# Operator Relay Reality

The founder's intended UX is direct AI-to-AI relay through FCR: an active operator can delegate a bounded task to another named peer operator and receive the validated response without founder copy/paste.

Current source truth on this focused relay repair line:

- the peer relay contract exists for `gemini`, `codex`, `claude-code`, and `perplexity`;
- dispatch is fail-closed and DeepSeek remains instructor-only;
- semantic peer-review provider spend is currently paused before dispatch by founder cost-control policy;
- exact request/response identity is bound and mutation authority does not travel with the relay;
- the canonical relay entry point is already mounted through authenticated FCR `/mcp`; the standalone `/api/operator-relay` router remains a test scaffold and must not become a second authority surface;
- exact-provider adapters exist for Gemini GenerateContent, OpenAI Responses, Anthropic Messages, and the Perplexity Agent API when server-held provider key plus explicit model are both configured;
- provider timeouts and successful response bodies are bounded; provider error bodies and transport exception details are not surfaced into application errors;
- configured provider/model provenance is built server-side and cannot be replaced by model-returned identity fields;
- Gemini, OpenAI, Anthropic, and Perplexity handoff configuration is provider-namespaced so one provider cannot silently inherit another provider's handoff flag;
- non-API transport candidates remain blocked handoffs until a real response is bound to the exact relay request.

This is still not a VERIFIED live bridge. Source implementation and preview deployment do not prove deployed provider credentials, OAuth client mapping, a successful live peer response, same-head runtime identity, or the founder-visible browser round trip.

The next gate is therefore live exact-head proof on the canonical runtime: deployed identity -> OAuth-bound founder request -> exact requested provider/model response -> evidence-bound return -> Playwright against the real path. If an authorized provider key/model or browser session is unavailable, preserve that one receipt as BLOCKED rather than substituting another provider or relabeling source tests as live evidence.
