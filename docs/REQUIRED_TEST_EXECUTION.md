# Required test execution and skipped-check policy

The FCR CI `Test` job is load-bearing for `Required Gate`. It runs all tests discovered by the approved Vitest configuration, writes a JSON execution report, and fails closed if the report is missing, malformed, empty, failed, or contains any skipped, pending, or todo test. Assertion-level status is checked even if aggregate counts incorrectly claim no skips. Every test must actually execute and pass.

The separate test-discovery ratchet prevents new hidden test files. Discovery proof alone is not execution proof. Do not add `test.skip`, `it.skip`, `describe.skip`, `test.todo`, `test.only`, or equivalent suppression to mandatory test suites. Fix the failing test or produce an explicit blocked/unknown result rather than weakening its gate.

Conditional GitHub workflow jobs and specially authorized production-only browser witnesses are not mandatory unit tests. Jobs for closing PRs, release promotions, production writes, provider-dependent previews, and production-only runtime witnesses must retain their existing event and authority guards. An out-of-scope skipped check must be classified as scope-not-applicable, not misreported as executed or passed. A required job that is skipped, cancelled, unknown, or missing is not a passing merge gate.

Implementation: `scripts/verify-vitest-no-skips.mjs`, `test/verify-vitest-no-skips.test.mjs`, and the existing `.github/workflows/ci.yml` Test job. The `vitest-results-<exact-head-SHA>` artifact contains evidence, not mutation authority. Keep the fail-closed checker in the existing Test job; do not introduce a parallel required status name or change GitHub repository rulesets.

Merge, deployment, and production authority remain independent and always require their native checks.
