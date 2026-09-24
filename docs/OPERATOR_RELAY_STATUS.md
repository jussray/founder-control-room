# Operator Relay Status

Current classification: SOURCE_WIRED_LIVE_UNPROVEN

Verified in authoritative FCR source:

- peer-operator contract for `gemini`, `codex`, `claude-code`, and `perplexity`;
- explicit exclusion of `deepseek-instructor` from the peer lane;
- zero-authority relay envelope for research, propose, review, and bounded implementation work;
- source-context fingerprinting and exact request/response hash binding;
- fail-closed dispatch when the requested operator is unavailable;
- direct Gemini, OpenAI, Anthropic, and Perplexity server adapters that exist only when both an explicit model and server-held key are configured;
- canonical `/mcp` OAuth route mounted through the FCR MCP router with server-owned project scope, OAuth client mapping, founder allowlist checks, and redacted evidence receipts;
- static-token compatibility clients cannot use peer relay;
- provider responses cannot grant mutation, merge, deploy, publish, provider-mutation, or spend authority;
- the current provider-cost gate can reject paid semantic `review` before the provider is called and the relay cannot bypass that blocker;
- the Cloudflare Worker Git authority audit can append a read-only `workerBindings` child receipt after its core read token is verified;
- global required Worker bindings continue to come only from `wrangler.worker.toml [secrets].required`, while `workerBindings.relayReady` independently observes `GEMINI_API_KEY`, `FCR_RELAY_GEMINI_MODEL`, and `FCR_REMOTE_MCP_OPERATOR_CLIENT_MAP` by binding name only;
- relay binding drift cannot change the core Worker Git authority audit `ok`/`error` verdict and does not become global Worker-startup or global deploy authority.

The standalone `/api/operator-relay` router remains an unmounted test scaffold. It is not the canonical authority path and must not be mounted merely to create a second relay surface. The authenticated `/mcp` tool is the authoritative relay entry point.

Not yet proven:

- that all three relay binding names are installed on the live `founder-control-room` Worker;
- that the configured Gemini credential/model are valid rather than merely present by name;
- a successful live relay against each configured provider from the deployed FCR runtime;
- provider/runtime evidence proving which requested operator actually answered on the deployed path;
- a real browser/Playwright round trip from founder-issued relay intent through FCR to the requested provider and back;
- same-head post-deployment runtime identity for that live round trip.

Provider configuration names, source validation, fingerprints/proof cookies, or a green source test cannot substitute for live receipts. Do not label the bridge VERIFIED until the live provider and founder-visible Playwright gates pass on the same exact deployed head.
