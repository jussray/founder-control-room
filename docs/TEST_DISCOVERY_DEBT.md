# Test discovery debt

## Reality

The default Vitest contract for Founder Control Room is intentionally narrow and explicit:

```text
src/**/*.test.{ts,js}
```

That contract includes colocated and `__tests__/` suites written as `.test.ts` or `.test.js`. Candidate test/spec files outside the contract are governed debt and must not disappear behind a green default `npm test` result.

`scripts/test-discovery-baseline.json` is the base-bound debt ledger. At this revision it is empty. A candidate may pay inherited debt down, but it may not add new excluded files to its own baseline.

## Discovery authority

`scripts/verify-test-discovery.mjs` does not trust a substring match, execute candidate-controlled configuration, or accept a candidate-selected legacy pattern. It parses the `defineConfig(...)` payload with a deliberately narrow non-executing static-literal grammar and requires the approved `test.include` contract exactly.

The grammar permits only static objects, arrays, quoted strings, finite numbers, booleans, and `null`. Executable or ambiguous forms such as environment-dependent branching, IIFEs, spreads, getters, computed/dynamic properties, duplicate keys, and other unsupported syntax fail closed and require a separately reviewed discovery-contract change.

A non-empty `test.exclude` is rejected because it can hide a file that the include pattern would otherwise discover.

The verifier then inventories candidate `.test` and `.spec` files across supported JavaScript and TypeScript suffixes and compares them with the approved discovery contract and the exact base's recorded debt.

## Ratchet invariants

The CI ratchet enforces all of the following:

- the candidate baseline may never grow beyond debt recorded on the exact base SHA;
- a stale baseline entry must be removed when its file is deleted or moved into default discovery;
- a candidate test/spec file outside the approved default discovery contract fails CI unless it is exact-base debt;
- a narrower include pattern is rejected;
- comment/inactive-text copies of the approved pattern cannot satisfy the effective config check;
- discovery-affecting `test.exclude` entries are rejected;
- candidate configuration is never executed by the verifier;
- dynamic or unsupported configuration syntax fails closed;
- the verifier is bound to `TEST_DISCOVERY_BASE_SHA` in CI.

## Why this is scoped proof

A green test-discovery ratchet proves only that the default test runner is not silently omitting candidate test files under this contract. It does not prove repository correctness, merge authorization, runtime correctness, deployment success, or external effects.

Likewise, a failing ratchet may block repository and merge gates without retroactively invalidating exact-head component evidence that has its own independent proof.

## Changing the contract

Do not broaden or narrow Vitest discovery casually. A discovery-contract change must move these together:

1. `vitest.config.ts`;
2. `scripts/test-discovery-baseline.json`;
3. `scripts/verify-test-discovery.mjs`;
4. `scripts/verify-test-discovery.node-test.mjs`;
5. this document.

Any new contract must preserve base-bound anti-laundering behavior and fail closed on configuration semantics the verifier cannot establish.
