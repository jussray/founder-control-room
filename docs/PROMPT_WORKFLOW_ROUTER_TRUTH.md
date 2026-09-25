# /truth — Prompt Workflow Router

VERIFIED in repository source on `feat/prompt-workflow-router`:
- the workflow contract file exists;
- deterministic intent stacks exist;
- new modes are registered as system-owned control inputs;
- selector output cannot grant execution authority;
- founder-gated route module exists;
- focused test files and CI/Playwright proof definitions exist;
- explicit stop gates exist for missing runtime mount.

INFERRED:
- focused tests should pass after server mount, but they have not yet produced an execution receipt.

BLOCKED:
- runtime reachability until `src/http/server.ts` imports and mounts the route.

UNKNOWN:
- deployed behavior until exact-head deployment and Playwright readback.
