# Test discovery debt

## Reality

`vitest.config.ts` now discovers both TypeScript and JavaScript test suites under `src/` through `src/**/*.test.{ts,js}`, including colocated files and files inside `__tests__/` directories.

A candidate test or spec file outside that exact pattern would be silently absent from the default `npm test` suite unless the ratchet rejected it. That is not evidence that the file never runs anywhere in CI—targeted workflows can invoke individual suites. The narrower risk is that a green default Vitest result could cover fewer candidate tests than the repository contains.

`scripts/test-discovery-baseline.json` is the current, machine-checked inventory of default-excluded candidate test files. It records no debt at this revision. Run `npm run verify:test-discovery` on the exact head for current counts; do not reuse a historical count as a present-tense CI claim.

## Why this matters more than the raw count

The historical undiscovered set was not incidental coverage. It disproportionately contained the repository's own safety apparatus:

- `src/security/securityPosture.test.ts`, `src/security/strategicSecurity.test.ts`, `src/security/untrustedArtifactBoundary.test.ts`
- `src/review/mergeReviewAuthority.test.ts`, `src/review/independentReviewGate.test.ts`, `src/review/founderFinalReviewPolicy.test.ts`
- `src/connectionVault/tokens.test.ts`
- `src/proof-gate/issueClose.test.ts`
- `src/governance/*.test.ts`, including two files explicitly named `*.redteam.test.ts`

Those TypeScript suites have since been brought into default discovery, their stale fixtures were repaired, and the remaining JavaScript Founder Signal Engine suite is now included by the TypeScript/JavaScript pattern. This closes the known default-discovery gap; it does not turn a green suite into deployment, runtime, or provider proof.

This failure mode has historically been repaired one file at a time rather than systemically. Treat individual PR references and prior test counts as provenance, not current proof.

## Historical failures inside the undiscovered set — superseded

Historical exploration found six failing tests among files then absent from default discovery. The stale fixtures and source-text contracts were resolved before the default pattern was broadened. The notes below remain provenance, not a current assertion that the files are excluded or failing.

### `src/governance/portfolioGovernanceProfiles.test.ts` — 3 failures

Stale fixtures, not an engine defect. `src/governance/portfolioDecisionContext.ts` later introduced a decision-context binding requirement: a consequential portfolio action must carry an `authorization.decisionContext` snapshot bound to the exact decision context. The newer sibling suite `portfolioDecisionContext.test.ts` satisfies this with a deliberate two-phase `bindCurrentContext()` helper.

`portfolioGovernanceProfiles.test.ts` predates that requirement. Its `authorization()` fixture omits `decisionContext`, so the two "complete proof ⇒ `allow`" cases can never reach `allow` — the engine correctly returns `reconfirm` with:

> `Consequential portfolio action requires execution authorization bound to the exact decision context.`

The third failure asserts a reason containing `different intent`; the engine correctly rejects the copied authorization but words it `Execution authorization scope does not cover this action.`

**The engine is behaving correctly and failing closed. The fixtures are stale.**

### `src/controllers/MergeIntentController.contract.test.ts` — 3 failures

These are source-text contract assertions — they read source files and regex-match expected vocabulary and code patterns. The referenced sources have since been refactored and no longer contain the asserted strings, for example:

- `READY remains reserved for a future p…`
- `preserve the sticky revocation state`
- `['MergeIntentController', new MergeI…`

Whether each represents a genuine regression in truthful vocabulary or a legitimate relocation is a founder-semantics judgement, not mechanical drift. **These are left for explicit owner adjudication rather than silently rewritten to match current source.**

## The ratchet

`scripts/verify-test-discovery.mjs` (npm script `verify:test-discovery`, wired into CI as a Required Gate job) enforces:

- the baseline is compared with the exact PR/push base SHA, so a candidate cannot add a newly default-excluded test to its own allowlist;
- the recorded baseline may **shrink**, but it may **never grow** from a candidate-only path;
- a stale entry must be removed when its test is moved into default discovery or deleted; and
- candidate `.test` and `.spec` files across supported JavaScript and TypeScript suffixes are checked, not just `.test.ts` files.

Adding a new candidate test excluded from the default suite fails CI with the exact path and the required move. The verifier understands the prior `__tests__`-only and TypeScript-only patterns so it can validate historical base debt during upgrades, but the checked baseline must match the active config exactly.

## Paying down the debt

The baseline is empty. If future exact-base debt appears, pay down each file by:

1. Move or rename it so the active default include owns it, or deliberately broaden the include with matching verifier coverage.
2. Fix any relative imports affected by that move.
3. Run it and repair any genuine failure it reveals.
4. Remove the entry from `scripts/test-discovery-baseline.json`.

The verifier reports files that have moved into discovery and prompts for the baseline to be shrunk accordingly.

Do not broaden the include pattern without first running the newly discovered suites and repairing genuine failures. Pattern, verifier, node-level anti-laundering tests, baseline, and this current-state document must move together.
