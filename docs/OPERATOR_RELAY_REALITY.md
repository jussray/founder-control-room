# Operator Relay Reality

The founder's intended UX is direct AI-to-AI relay through FCR: an active operator can delegate a bounded task to another named peer operator and receive the validated response without founder copy/paste.

Current authoritative source truth:

- the peer relay contract includes `gemini`, `codex`, `claude-code`, and `perplexity`;
- dispatch is fail-closed and never silently substitutes another provider;
- DeepSeek remains instructor-only and outside the peer relay lane;
- exact request/response identity is bound through hashes and provider evidence references;
- mutation, merge, deploy, publish, and provider-mutation authority do not travel with the relay;
- the canonical relay entry point is the authenticated FCR `/mcp` tool `fcr_relay_operator`;
- the canonical `/mcp` path requires OAuth-bound client identity and operator mapping;
- direct Gemini, OpenAI, Anthropic, and Perplexity server adapters are present only when the matching server-held credential and explicit model are configured;
- current provider-cost policy can reject paid semantic `review` before a provider call, and relay routing cannot bypass that gate;
- relay provider bindings are capability-specific and intentionally do not become global Worker-startup or global production-deploy requirements;
- the standalone `/api/operator-relay` router is an unmounted test scaffold and must not be mounted as a second authority surface.

Current classification: SOURCE_WIRED_LIVE_UNPROVEN.

The bridge becomes VERIFIED only after the exact deployed head is identified, an OAuth-bound operator client issues a bounded relay to the requested real provider, the returned response is bound to the exact request hash and provider evidence reference, and the founder-visible round trip passes Playwright against that same runtime head.

Missing provider credentials, model configuration, OAuth operator mapping, deployment identity, or browser/runtime access are blockers for the relay capability only. They must not take down unrelated FCR runtime or block an unrelated production release. Source tests, binding names, fingerprints, or proof cookies cannot substitute for live provider/runtime evidence and cannot create authority.
