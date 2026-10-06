# Operator Relay Status

Current classification: PARTIAL

Verified in authoritative FCR source:

- canonical peer registry for `gemini`, `codex`, `claude-code`, `perplexity`, and `muse`;
- explicit exclusion of plain `deepseek` and `deepseek-instructor` from the peer lane; DeepSeek remains instructor-only through the separate interop contract;
- zero-authority relay envelope for research, propose, review, and bounded implementation work;
- source-context fingerprinting and exact request/response hash binding;
- fail-closed dispatch when the requested operator is unavailable;
- source-wired Gemini, OpenAI/Codex, Anthropic/Claude, Perplexity, and Muse provider adapters, each gated by its required server-side credential/model configuration;
- canonical `/mcp` OAuth route mounted through the FCR MCP router with server-owned project scope, OAuth client mapping, founder allowlist checks, and redacted evidence receipts;
- static-token compatibility clients cannot use peer relay;
- provider responses cannot grant mutation, merge, deploy, publish, or provider-mutation authority;
- MCP target schema derives from the canonical peer registry rather than a duplicated peer list;
- dispatch invents no fallback provider and must not silently substitute a different peer or role;
- exact current-main CI/check evidence exists independently of older relay preflight receipts.

The standalone `/api/operator-relay` router remains an unmounted test scaffold. It is not the canonical authority path and must not be mounted merely to create a second relay surface. The authenticated `/mcp` tool is the authoritative relay entry point.

Not yet proven:

- a successful live relay against each configured provider from the deployed FCR runtime;
- provider/runtime evidence proving which requested operator actually answered on the deployed path;
- a real browser/Playwright round trip from founder-issued relay intent through FCR to the requested provider and back;
- same-head post-deployment runtime identity for that live round trip.

Source wiring, provider configuration, or a green source test cannot substitute for those live receipts. Provider paths remain `PARTIAL` until the provider/runtime and Playwright gates pass on the same exact deployed head for the claimed invocation.
