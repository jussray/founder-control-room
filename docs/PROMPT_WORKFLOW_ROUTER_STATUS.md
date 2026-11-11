# Prompt Workflow Router Status

Status: SOURCE IMPLEMENTED / RUNTIME MOUNT BLOCKED

Current branch includes the approved prompt workflow contract, deterministic router, authority registry hardening, founder-gated adapter, focused tests, CI definitions, source stop gates, runtime Playwright specification, rollback, threat model, and proof vocabulary.

The branch intentionally carries a failing mount expectation until `src/http/server.ts` receives the focused import + mount. This prevents a route module from being mistaken for a reachable product path.
