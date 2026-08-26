# Test discovery debt

## Reality

`vitest.config.ts` currently uses the default include `src/**/*.test.ts`. That discovers colocated and `__tests__/` TypeScript `.test.ts` files under `src/`.

Candidate test files outside that exact TypeScript-only pattern are absent from the default `npm test` suite: they do not fail, warn, or appear in that suite's result. That is not evidence that a file never runs anywhere in CI because targeted workflows can invoke individual suites. The defect is narrower and still serious: a green default Vitest result can cover fewer candidate tests than the repository contains.

`scripts/test-discovery-baseline.json` is the current, machine-checked inventory of default-excluded candidate test files. At this revision, the known base-bound debt is `src/lib/__tests__/founderSignalEngineConsole.test.js`, which remains excluded because it is JavaScript, not because of its directory. Run `npm run verify:test-discovery` on the exact head for current counts; do not reuse a historical count as a present-tense CI claim.

## Why this matters more than the raw count

Historically, the undiscovered set disproportionately contained the repository's own safety apparatus, including:

- `src/security/securityPosture.test.ts`, `src/security/strategicSecurity.test.ts`, `src/security/untrustedArtifactBoundary.test.ts`
- `src/review/mergeReviewAuthority.test.ts`, `src/review/independentReviewGate.test.ts`, `src/review/founderFinalReviewPolicy.test.ts`
- `src/connectionVault/tokens.test.ts`
- `src/proof-gate/issueClose.test.ts`
- `src/governance/*.test.ts`, including files explicitly named `*.redteam.test.ts`

The current repository-wide TypeScript include paid down that broad TypeScript discovery gap. The remaining lesson still holds: a green default Vitest result is evidence only for tests the effective configuration actually discovers. A targeted workflow can add evidence only for the exact file, head, and result it executed.

This failure mode was historically repaired one file at a time rather than systemically. Treat individual PR references and prior test counts as provenance, not current proof.

## Known historical failures inside the former undiscovered set

Historical exploration found six failing tests among files that were absent from default discovery at that time. That is **historical evidence**, not a current assertion that those files never ran in every CI workflow or still fail on the present head. Broadening discovery can surface existing failures; it does not cause them.

### `src/governance/portfolioGovernanceProfiles.test.ts` — 3 historical failures

Stale fixtures, not an engine defect. `src/governance/portfolioDecisionContext.ts` later introduced a decision-context binding requirement: a consequential portfolio action must carry an `authorization.decisionContext` snapshot bound to the exact decision context. The newer sibling suite `portfolioDecisionContext.test.ts` satisfies this with a deliberate two-phase `bindCurrentContext()` helper.

`portfolioGovernanceProfiles.test.ts` predates that requirement. Its `authorization()` fixture omits `decisionContext`, so the two "complete proof ⇒ `allow`" cases could not reach `allow` under that contract; the engine correctly returned `reconfirm` with:

> `Consequential portfolio action requires execution authorization bound to the exact decision context.`

The third historical failure asserted a reason containing `different intent`; the engine rejected the copied authorization but worded it `Execution authorization scope does not cover this action.`

**The engine was behaving correctly and failing closed; the fixtures were stale.**

### `src/controllers/MergeIntentController.contract.test.ts` — 3 historical failures

These were source-text contract assertions that read source files and regex-matched expected vocabulary and code patterns. The referenced sources had been refactored and no longer contained asserted strings such as:

- `READY remains reserved for a future p…`
- `preserve the sticky revocation state`
- `['MergeIntentController', new MergeI…`

Whether each represented a genuine regression in truthful vocabulary or a legitimate relocation was a founder-semantics judgement, not mechanical drift. They were left for explicit owner adjudication rather than silently rewritten to match current source.

## The ratchet

`scripts/verify-test-discovery.mjs` (npm script `verify:test-discovery`, wired into CI as a Required Gate job) enforces:

- the candidate baseline pattern must exactly match the effective top-level `test.include` declaration, not a comment or inactive string elsewhere in the config;
- the supported discovery contract fails closed if a top-level `test.exclude` is introduced, because exclusions can silently hide otherwise matching tests;
- base debt is derived using the base commit's own effective discovery pattern, so a candidate cannot regress the include pattern and reclassify previously discovered tests as old debt;
- the recorded baseline may **shrink**, but it may **never grow** from a candidate-only path;
- a stale entry must be removed when its test becomes discoverable or is deleted; and
- candidate `.test` and `.spec` files across supported JavaScript and TypeScript suffixes are inventoried, not just `.test.ts` files.

Adding a new candidate test excluded from the default suite fails CI with the exact path. This deliberately does not make every historical debt item fail the default suite immediately; it stops new debt, keeps existing base-bound debt named, and requires a focused repair before a prior exclusion can return.

Discovery-contract migrations are intentionally stricter than ordinary debt paydown. Changing `test.include`, adding `test.exclude`, or introducing another discovery-affecting setting requires a dedicated reviewed verifier update rather than silently teaching the current candidate to bless its own new semantics.

## Paying down the debt

For each file in the current baseline:

1. Determine why it is outside the effective default include. Directory movement is not automatically a fix.
2. For the current JavaScript debt, prefer converting or replacing the test with an equivalent `.test.ts` file when that preserves behavior and imports cleanly.
3. Run the exact test and the default `npm test` path, repairing any genuine failure the newly discovered test reveals.
4. Remove the paid-down entry from `scripts/test-discovery-baseline.json`.
5. Run `npm run verify:test-discovery` with the exact base SHA in CI so the ratchet proves the baseline shrank rather than laundering new debt.

Do not pay debt down by weakening the verifier, adding a broad `test.exclude`, or changing the include semantics inside an unrelated feature PR. If the repository intentionally changes Vitest discovery semantics, update the config, verifier, baseline, focused verifier tests, and this runbook together under a dedicated review.
