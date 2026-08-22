# Test discovery debt

## Reality

`vitest.config.ts` discovers only `src/**/__tests__/**/*.test.ts` by default.

A candidate test file outside that exact pattern is silently absent from the default `npm test` suite: it does not fail, warn, or appear in that suite's result. That is not evidence that the file never runs anywhere in CI—targeted workflows can invoke individual suites. The defect is narrower and still serious: a green default Vitest result can cover fewer candidate tests than the repository contains.

`scripts/test-discovery-baseline.json` is the current, machine-checked inventory of default-excluded candidate test files. Run `npm run verify:test-discovery` on the exact head for counts; do not reuse a historical count as a present-tense CI claim.

## Why this matters more than the raw count

The undiscovered set is not incidental coverage. It disproportionately contains the repository's own safety apparatus:

- `src/security/securityPosture.test.ts`, `src/security/strategicSecurity.test.ts`, `src/security/untrustedArtifactBoundary.test.ts`
- `src/review/mergeReviewAuthority.test.ts`, `src/review/independentReviewGate.test.ts`, `src/review/founderFinalReviewPolicy.test.ts`
- `src/connectionVault/tokens.test.ts`
- `src/proof-gate/issueClose.test.ts`
- `src/governance/*.test.ts`, including two files explicitly named `*.redteam.test.ts`

A green **default Vitest** result alone is therefore not evidence that merge authority, review gating, credential vault handling, or the governance runtime behave as their excluded tests assert. A targeted workflow can add evidence only for the exact file, head, and result it executed.

This failure mode has historically been repaired one file at a time rather than systemically. Treat individual PR references and prior test counts as provenance, not current proof.

## Known failures inside the undiscovered set

Historical exploration found six failing tests among files absent from default discovery. That is **historical evidence**, not a current assertion that those files never ran in every CI workflow or still fail on the present head. Broadening discovery can surface existing failures; it does not cause them.

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

Adding a new candidate test excluded from the default suite fails CI with the exact path and the required move. This deliberately does not make every historical debt item fail the default suite immediately; it stops new debt, keeps existing debt named, and requires a focused repair before a prior exclusion can return.

## Paying down the debt

For each file in the baseline:

1. Move it into a `__tests__/` directory beside its subject — `src/foo/bar.test.ts` → `src/foo/__tests__/bar.test.ts`.
2. Fix the relative import (`./subject.js` → `../subject.js`).
3. Run it and repair any genuine failure it reveals.
4. Remove the entry from `scripts/test-discovery-baseline.json`.

The verifier reports files that have moved into discovery and prompts for the baseline to be shrunk accordingly.

Do not pay this debt down by broadening the `include` pattern alone — that would surface the 6 known failures as an immediate red Required Gate across the whole repository without first resolving them.
