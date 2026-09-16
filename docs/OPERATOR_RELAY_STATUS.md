# Operator Relay Status

Current classification: PARTIAL

Implemented on the current FCR source line:

- peer-operator contract for `codex`, `claude-code`, and `perplexity`;
- explicit exclusion of `deepseek-instructor` from the peer lane;
- zero-authority relay envelope;
- source-context fingerprinting;
- request/response hash binding;
- fail-closed dispatch when the requested operator is unavailable;
- HTTP route contract and focused tests.

Not yet proven:

- route mounted behind the canonical authenticated FCR server/worker path;
- real Anthropic/Perplexity/OpenAI operator adapters for the relay contract;
- same-head CI/typecheck/focused tests;
- live provider receipt identifying the requested operator;
- Playwright round-trip from founder request to returned operator response.

Do not label the bridge VERIFIED until these gates are satisfied on the same exact head.
