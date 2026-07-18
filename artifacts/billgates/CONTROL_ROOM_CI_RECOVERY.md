# Founder Control Room CI Recovery

## Executive decision

Founder Control Room is not fully operating as an autonomous control loop.

The control-plane Supabase project is healthy and continues to accept founder mission and project events, but the controller execution path is stale: the only observed controller lease expired on July 15, 2026, while controller outbox, reconciliation-run, and issue-summary tables remain empty. GitHub failure routing for Se’kret Bip PR #480 has not produced a persisted Control Room failure record.

The correct response is not to merge, deploy, enable the guarded terminal, or mutate the live database. The reversible move is to restore truthful exact-head verification first.

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

A conflict-independent proof driver verified immutable payload head `a91c001bed76fb97700b568f0daa5eea4e382dba` in run `29626029420`.

- Exact Target Metadata `88030504936` passed.
- Guarded Terminal and AI Contracts `88030504944` passed.
- Typecheck `88030504927` executed and failed.
- Lint `88030504953` executed and failed.
- Unit Tests `88030504942` executed and failed.
- Production Build `88030504946` executed and failed.
- Migration Lint Evidence `88030504926` executed and failed.

The retained diagnostics established:

- Typecheck and build had contract drift: missing `ReconcileRequest.meta`, missing `ProofGateController.noOp`, invalid chained Supabase RPC usage, an unsupported `founder_triggered` reason, Cloudflare handler parameter conflicts, and outbox attempt-name drift.
- `helmet`, `cors`, and `express-rate-limit` were imported but absent from the package manifest and lockfile.
- Lint had three real unused-symbol errors plus warnings. The script converted warnings into failures with `--max-warnings 0` despite the ESLint policy intentionally classifying those rules as warnings.
- The first migration job never reached SQL because no local Postgres service was started.
- The second unit artifact reported CORS failures caused by undeclared security packages and approval-route timeouts caused by non-constructable class doubles.

A second immutable verification run, `29626366042`, checked payload head `9cc76561a87ec227e1904c521a40e870a191df2e` and materially narrowed the failure surface:

- Exact Target Metadata `88031480640` passed.
- Guarded Terminal and AI Contracts `88031480637` passed.
- Unit Tests `88031480645` passed.
- Lint `88031480648` passed with warnings visible and zero errors.
- Typecheck `88031480679` and Production Build `88031480629` each failed on the same single DOM-versus-Workers `Response` type boundary. That boundary was then made explicit in `src/worker/cf-entry.ts`.
- Migration Lint Evidence `88031480656` started an ephemeral local database, applied the schema, and reached migration execution. It then failed because both `20260711_reconciliation.sql` and `20260711_proof_gate_results.sql` registered the same migration version `20260711`.

The live Supabase migration ledger was inspected read-only. It records the authoritative deployed lineage as:

- `20260711211416_reconciliation`
- `20260711211452_reconciliation_fix_execute_grants`
- `20260711214937_proof_gate_results`

The recovery branch now uses those full versions, restores the missing execute-grant hardening migration, and removes the two truncated duplicate files. No live migration was applied or modified.

The guarded terminal contract passed throughout. The evidence does not support rewriting terminal runtime behavior.

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
- makes the Cloudflare Workers response bridge explicit at the DOM type boundary;
- keeps ESLint warnings visible but non-blocking while preserving all error-level enforcement;
- aligns duplicate migration filenames to the deployed full-timestamp lineage;
- restores service-role-only execute grants for reconciliation RPCs;
- preserves authentication, exact-head, idempotency, fail-closed, and no-carry-forward approval behavior.

Every new commit creates a new exact head and invalidates older verification for merge purposes.

## Authority and non-actions

This recovery slice does not:

- merge any pull request;
- deploy Founder Control Room or Se’kret Bip;
- apply or repair a live Supabase migration;
- enable local or remote terminal execution;
- create production credentials;
- alter RLS, authentication, billing, DNS, or customer data;
- treat local or partial evidence as exact-head proof.

## Acceptance gates

The final recovery head must execute and pass:

1. Exact target SHA assertion
2. Typecheck
3. Lint
4. Unit Tests
5. Guarded Terminal and AI Skill Contracts
6. Production Build
7. Migration lint against an ephemeral local database

Any job with no executed steps remains infrastructure evidence. Any executed failing source or configuration step remains actionable until corrected and rerun at the exact head.

## Rollback

Delete the child branch or close draft PR #43. Close verification-only PR #44 after evidence capture. The parent PR #35 remains untouched, the production database remains unchanged, and no deployment state changes.
