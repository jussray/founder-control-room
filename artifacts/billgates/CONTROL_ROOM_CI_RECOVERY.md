# Founder Control Room CI Recovery

## Executive decision

Founder Control Room is not fully operating as an autonomous control loop.

The control-plane Supabase project is healthy and continues to accept founder mission and project events, but the controller execution path is stale: the only observed controller lease expired on July 15, 2026, while controller outbox, reconciliation-run, and issue-summary tables remain empty. GitHub failure routing for Se’kret Bip PR #480 has not produced a persisted Control Room failure record.

The correct response is not to merge, deploy, enable the guarded terminal, or apply the pending reconciliation migration. The reversible move is to restore truthful exact-head verification first.

## Exact GitHub evidence

Repository: `jussray/founder-control-room`

Parent PR: `#35 Add guarded terminal, proof-gated merges, and AI sales controls`

Parent head: `d84f4e642ea406ac4c05ca8705f9812d804a367b`

### Initial classification

CI run `29622908334` contained four failed jobs with no executed steps or logs:

- Test `88021361481`
- Migration lint `88021361491`
- Type check `88021361493`
- Lint `88021361500`

Classification: `runner_startup_failure`

This evidence does not prove a code regression.

### Changed classification

Quality Gate run `29622908299` later received runners and executed real steps.

- Lint `88026500401` failed at `npm run lint`.
- Unit Tests `88026500416` failed at the Vitest command and retained artifact `8423411134`.
- Typecheck `88026500421` failed at `npm run typecheck`.
- Guarded Terminal and AI Skill Contracts `88026500432` passed.
- Production Build `88026539033` was skipped because required predecessors failed.

Classification: `workflow_step_failure`

This changed the actionable next step from waiting for runner recovery to repairing the smallest demonstrated source and test-contract defects.

## Demonstrated root causes

The first retained unit artifact reported 21 failed tests across four suites.

1. Proof-gate tests read generated failures from `result.evidence.failures`, although the canonical immutable ledger is `result.allFailures`.
2. CORS tests used a variable dynamic import query unsupported by the Vitest transform and depended on a private field from the `cors` middleware package.
3. Approval-route tests referenced top-level variables inside hoisted `vi.mock` factories.
4. Terminal-route tests had the same hoisted-factory defect.

A conflict-independent proof driver then verified immutable recovery payload head `a91c001bed76fb97700b568f0daa5eea4e382dba` in run `29626029420`.

- Exact Target Metadata `88030504936` passed.
- Guarded Terminal and AI Contracts `88030504944` passed.
- Typecheck `88030504927` executed and failed.
- Lint `88030504953` executed and failed.
- Unit Tests `88030504942` executed and failed.
- Production Build `88030504946` executed and failed.
- Migration Lint Evidence `88030504926` executed and failed.

The retained diagnostics established:

- Typecheck and build had the same contract drift: missing `ReconcileRequest.meta`, missing `ProofGateController.noOp`, invalid chained Supabase RPC usage, an unsupported `founder_triggered` reason, Cloudflare handler parameter conflicts, and outbox attempt-name drift.
- `helmet`, `cors`, and `express-rate-limit` were imported but absent from the package manifest and lockfile.
- Lint had three real unused-symbol errors plus 29 warnings. The script converted warnings into failures with `--max-warnings 0` despite the ESLint policy intentionally classifying those rules as warnings.
- Migration lint did not inspect SQL. It failed while connecting to a local Postgres instance that the workflow never started. That result is infrastructure/configuration evidence, not migration-regression evidence.
- The second unit artifact reported 14 CORS failures caused by the undeclared security packages and nine approval-route five-second timeouts caused by non-constructable class doubles. Other suites passed.

The guarded terminal contract itself passed throughout. The evidence does not support rewriting terminal runtime behavior.

## Recovery slice

Branch: `agent/pr35-ci-recovery`

Draft pull request: `#43 Fix PR #35 exact-head CI contract failures`

Verification-only driver: draft PR `#44 Verify PR #35 recovery at immutable target SHA`. The driver must not be merged.

The slice now:

- updates proof-gate assertions to use `allFailures` without mutating caller evidence;
- tests CORS through exported Express middleware and literal module reloads;
- replaces undeclared security middleware dependencies with local typed CORS, security-header, and rate-limit middleware;
- makes approval and terminal route doubles Vitest-hoist-safe, with constructable class doubles where production code uses `new`;
- adds founder-triggered request metadata to the reconciliation contract;
- restores the ProofGateController no-op result contract;
- separates provider-event state updates from RPC attempt increments;
- aligns the reconciler with the persisted `attempt_count` shape without passing an unused request field;
- uses contextual Cloudflare Worker handler types;
- keeps ESLint warnings visible but non-blocking while preserving all error-level enforcement;
- preserves authentication, exact-head, idempotency, fail-closed, and no-carry-forward approval behavior.

Every new commit creates a new exact head and invalidates older verification for merge purposes.

## Authority and non-actions

This recovery slice does not:

- merge any pull request;
- deploy Founder Control Room or Se’kret Bip;
- apply a Supabase migration;
- enable local or remote terminal execution;
- create production credentials;
- alter RLS, authentication, billing, DNS, or customer data;
- treat local or partial evidence as exact-head proof.

## Acceptance gates

The final recovery head must execute and pass:

1. Typecheck
2. Lint
3. Unit Tests
4. Guarded Terminal and AI Skill Contracts
5. Production Build

Migration lint must either:

- start a local Supabase/Postgres stack before `supabase db lint --local`; or
- use another supported database target and clearly label the evidence.

Until then, its connection failure is not a SQL verdict and cannot block on the claim of a migration regression.

Any job with no executed steps remains infrastructure evidence. Any executed failing source step remains a code or configuration defect until corrected and rerun at the exact head.

## Rollback

Delete the child branch or close draft PR #43. Close verification-only PR #44 after evidence capture. The parent PR #35 remains untouched, the production database remains unchanged, and no deployment state changes.
