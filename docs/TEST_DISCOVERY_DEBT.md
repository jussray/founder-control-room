# Test discovery debt

## Reality

`vitest.config.ts` discovers only `src/**/__tests__/**/*.test.ts`.

A test file placed anywhere else under `src/` is **silently skipped**. It does not fail, it does not warn, it produces no output at all — `npm test` simply reports success over a smaller set than the repository appears to contain.

Measured on `main` at the time this document was written:

| Metric | Count |
|---|---|
| Test files under `src/` | 237 |
| Discovered by `npm test` | 200 |
| **Never executed in CI** | **37** |
| Tests executed by `npm test` | 1285 |
| Tests executed when discovery is broadened | 1533 |
| **Tests never executed in CI** | **248** |

## Why this matters more than the raw count

The undiscovered set is not incidental coverage. It disproportionately contains the repository's own safety apparatus:

- `src/security/securityPosture.test.ts`, `src/security/strategicSecurity.test.ts`, `src/security/untrustedArtifactBoundary.test.ts`
- `src/review/mergeReviewAuthority.test.ts`, `src/review/independentReviewGate.test.ts`, `src/review/founderFinalReviewPolicy.test.ts`
- `src/connectionVault/tokens.test.ts`
- `src/proof-gate/issueClose.test.ts`
- `src/governance/*.test.ts`, including two files explicitly named `*.redteam.test.ts`

A green CI badge has therefore never been evidence that merge authority, review gating, credential vault handling, or the governance runtime behave as their tests assert.

This failure mode has already shipped twice and been repaired individually rather than systemically:

- `src/capabilities/score.test.ts` (repaired in PR #154)
- `src/futureyou/missionControl.test.ts` (introduced by PR #421 and still undiscovered)

## Known failures inside the undiscovered set

Running the undiscovered files reveals **6 currently failing tests** that CI has never reported. These are pre-existing on `main`; broadening discovery would surface them, not cause them.

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

- the recorded baseline in `scripts/test-discovery-baseline.json` may **shrink**;
- it may **never grow**.

Adding a new test file outside a `__tests__/` directory fails CI with the exact path and the required move.

This deliberately does **not** fail on the existing 37-file backlog. Turning CI red on pre-existing failures would block every unrelated change; the ratchet stops the bleeding first and keeps the remaining debt named, counted, and visible.

## Paying down the debt

For each file in the baseline:

1. Move it into a `__tests__/` directory beside its subject — `src/foo/bar.test.ts` → `src/foo/__tests__/bar.test.ts`.
2. Fix the relative import (`./subject.js` → `../subject.js`).
3. Run it and repair any genuine failure it reveals.
4. Remove the entry from `scripts/test-discovery-baseline.json`.

The verifier reports files that have moved into discovery and prompts for the baseline to be shrunk accordingly.

Do not pay this debt down by broadening the `include` pattern alone — that would surface the 6 known failures as an immediate red Required Gate across the whole repository without first resolving them.
