# Required test execution and skipped-check policy

The FCR CI `Test` job is load-bearing for `Required Gate`. It runs all tests discovered by the approved Vitest configuration, writes a JSON execution report, and fails closed if the report is missing, malformed, empty, failed, or contains any skipped, pending, or todo test. Assertion-level status is checked even if aggregate counts incorrectly claim no skips. Every test must actually execute and pass.

The separate test-discovery ratchet prevents new hidden test files. Discovery proof alone is not execution proof. Do not add `test.skip`, `it.skip`, `describe.skip`, `test.todo`, `test.only`, or equivalent suppression to mandatory test suites. Fix the failing test or produce an explicit blocked/unknown result rather than weakening its gate.

## Founder-wide zero-skipped-check contract (2026-10-15)

The founder requires **zero skipped checks** throughout governed Juss & Co. repositories. No `skipped`, `neutral`, `not-run`, `todo`, or unstarted result counts as executed proof, even if a provider renders it as an apparently benign conclusion. Every discovered exact-head check lane must be classified explicitly; a nonzero skipped count blocks **complete CI verification and merge-readiness claims** until corrected. Keep original provider conclusions and names in receipts so the failure remains diagnosable; never rewrite skipped evidence as `success`.

An operation that genuinely does not apply should **not schedule a check in the first place**. Prefer event-specific workflows over conditional job-level `if` clauses that manufacture skipped check runs. For required security, safety, auth, database, accessibility, Playwright, and test gates, execute the real test against the correct authorized target or return a blocking outcome. A self-reported `N/A` is not a substituted passing test. Missing credentials, a failed staging branch, billing quotas, unavailable reviewers, and provider integrations must remain visible blockers, not permission to mark checks green.

Production writes, deployments, database migrations, PR-close cleanup, and protected browser witnesses retain their event and authority guards. This policy **does not** authorize triggering privileged workflows on every PR merely to remove a skip. Separate the events, fix the provider state, or leave the lane blocked until its original proof contract can be met.

**Implementation scope:** FCR PR #950 enforces no skipped/pending/todo **Vitest tests** within its existing Test job. Se'kret Bip PR #1153 adds a strict exact-head check ledger and splits avoidable conditional PR-continuity jobs. These source changes are unmerged candidates, not a claim of portfolio-wide live enforcement. Each other repository needs its own inspected adoption, tests, protected-rule readback, and distinct merge/deploy authorization.

Implementation: `scripts/verify-vitest-no-skips.mjs`, `test/verify-vitest-no-skips.test.mjs`, and the existing `.github/workflows/ci.yml` Test job. The `vitest-results-<exact-head-SHA>` artifact contains evidence, not mutation authority. Keep the fail-closed checker in the existing Test job; do not introduce a parallel required status name or change GitHub repository rulesets.

Merge, deployment, and production authority remain independent and always require their native checks.

## Read-only Autoresearch CI pilot

The existing CI Test and Required Gate lanes remain authoritative. The Autoresearch pilot runs `node --test test/ci-autoresearch.test.mjs` inside the existing test-discovery job and offers the offline evaluator `node scripts/ci-autoresearch.mjs evidence.json`. It does not change the branch protection, add required checks, edit source automatically, create PRs, run paid models, publish, merge, or deploy.

An evidence input must contain at least three complete, exact-head CI run receipts for the baseline and candidate, with comparable runner and test-suite identity, required job statuses, real execution timings, and test/security/authority gate results. A single run, missing check, skipped test, lower test count, missing witness, or incompatible runner blocks or defers the evaluation. Evaluation results are **inferences from supplied input**, not independently verified GitHub proof. The synthetic unit-test fixtures demonstrate algorithm behavior only.

This is a bounded comparison component, not an autonomous code-editing agent or an overnight scheduler. Founder approval and independently observed provider receipts remain required before any consequential KEEP, merge, or deploy action.
