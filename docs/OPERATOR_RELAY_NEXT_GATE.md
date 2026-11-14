# Operator Relay Next Gate

The canonical relay is already mounted through the authenticated FCR `/mcp` authority path. Do not mount the standalone `/api/operator-relay` test router and do not create a second authority surface.

Relay provider configuration is capability-specific. `GEMINI_API_KEY`, `FCR_RELAY_GEMINI_MODEL`, and `FCR_REMOTE_MCP_OPERATOR_CLIENT_MAP` must not become global Worker-startup or global production-deploy requirements merely to make the relay fail closed. Missing relay configuration must block the relay capability precisely while unrelated FCR runtime and release paths remain available.

The existing read-only Cloudflare Worker Git authority audit may append a `workerBindings` child receipt after its core read token is independently verified. That receipt observes binding names only, retains no secret values or undeclared binding names, keeps global `wrangler.worker.toml [secrets].required` drift separate from the three-name `relayReady` signal, and cannot upgrade or downgrade the core Worker Git authority verdict.

The next gate is live proof, not another contract file:

1. run the exact-current-main read-only Cloudflare audit and require `workerBindings.relayReady: true` without exposing values;
2. separately prove the configured Gemini credential/model are valid through an actual provider call rather than name presence;
3. confirm the deployed FCR runtime identifies the exact approved head;
4. use an OAuth-bound operator client mapped by `FCR_REMOTE_MCP_OPERATOR_CLIENT_MAP`;
5. issue one bounded relay request to the exact requested peer provider that is permitted by current cost policy;
6. require a response bound to the exact relay/request hash and provider evidence reference;
7. prove the founder-visible round trip with Playwright against the real runtime;
8. keep spend, mutation, merge, deploy, publish, and provider-mutation authority false throughout.

If a requested provider binding is absent, provider authentication fails, the OAuth client is not mapped, or current cost policy blocks that capability, return the precise blocker. Never silently substitute a different provider and never promote binding presence, fingerprints, or proof cookies into authority.
