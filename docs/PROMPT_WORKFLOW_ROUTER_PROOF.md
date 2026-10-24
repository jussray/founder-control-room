# Prompt Workflow Router Proof Receipt

## REALITY

Branch: `feat/prompt-workflow-router`
Base exact HEAD: `25cf097867fdb9f1e24d426a52f015d9bbcb34d7`

Implemented:
- canonical builder prompt workflow contract;
- deterministic trusted intent → mode stack selector;
- expanded system-owned mode registry so mode names cannot be executable action types;
- founder-gated read-only HTTP selection adapter;
- focused unit and integration tests;
- exact-head CI proof workflow;
- runtime Playwright proof contract;
- explicit server-mount merge gate.

## INVARIANTS

- workflow selection never increases authority;
- workflow selection never authorizes execution;
- untrusted external text cannot self-activate internal modes;
- unsupported intent fails closed;
- rendered/live runtime claims require deployed Playwright proof;
- capability and approval remain separate.

## OPEN GATE

`src/http/server.ts` still needs the two-line import/mount integration described in `docs/PROMPT_WORKFLOW_ROUTER_RUNTIME_WIRING.md`. The committed mount test intentionally prevents treating the route module as runtime-wired until that exact integration exists.

After mount: run focused CI, deploy exact SHA, then run `Prompt Workflow Router Runtime Proof` with the deployed base URL and founder Playwright bearer. Do not call the feature live before that proof is green.
