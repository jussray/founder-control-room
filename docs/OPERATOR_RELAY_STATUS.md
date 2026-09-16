# Operator Relay Status

Current classification: PARTIAL

Verified in authoritative FCR source:

- peer-operator contract for `codex`, `claude-code`, and `perplexity`;
- explicit exclusion of `deepseek-instructor` from the peer lane;
- zero-authority relay envelope for research, propose, review, and bounded implementation work;
- source-context fingerprinting and exact request/response hash binding;
- fail-closed dispatch when the requested operator is unavailable;
- direct OpenAI, Anthropic, and Perplexity server adapters that exist only when both an explicit model and server-held key are configured;
- canonical `/mcp` OAuth route mounted through the FCR MCP router with server-owned project scope, OAuth client mapping, founder allowlist checks, and redacted evidence receipts;
- static-token compatibility clients cannot use peer relay;
- provider responses cannot grant mutation, merge, deploy, publish, or provider-mutation authority;
- exact current-main CI/check evidence exists independently of the older relay preflight.

The standalone `/api/operator-relay` router remains an unmounted test scaffold. It is not the canonical authority path and must not be mounted merely to create a second relay surface. The authenticated `/mcp` tool is the authoritative relay entry point.

Not yet proven:

- a successful live relay against each configured provider from the deployed FCR runtime;
- provider/runtime evidence proving which requested operator actually answered on the deployed path;
- a real browser/Playwright round trip from founder-issued relay intent through FCR to the requested provider and back;
- same-head post-deployment runtime identity for that live round trip.

Provider configuration or a green source test cannot substitute for those live receipts. Do not label the bridge VERIFIED until the live provider and Playwright gates pass on the same exact deployed head.
