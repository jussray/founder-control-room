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

## Demonstrated unit root causes

The retained test artifact reported 21 failed tests across four suites.

1. Proof-gate tests read generated failures from `result.evidence.failures`, although the canonical immutable ledger is `result.allFailures`.
2. CORS tests used a variable dynamic import query unsupported by the Vitest transform and depended on a private field from the `cors` middleware package.
3. Approval-route tests referenced top-level variables inside hoisted `vi.mock` factories.
4. Terminal-route tests had the same hoisted-factory defect.

The guarded terminal contract itself passed. The evidence therefore does not support rewriting terminal runtime behavior.

## Recovery slice

Branch: `agent/pr35-ci-recovery`

Draft pull request: `#43 Fix PR #35 exact-head CI contract failures`

The first published recovery head was `d599c1d7310a3c725989423c559e2030cf788c0b`. Every later commit creates a new exact head and invalidates older verification for merge purposes.

The slice:

- updates proof-gate assertions to use `allFailures` without mutating caller evidence;
- tests CORS through the exported Express middleware and literal module reloads;
- moves approval and terminal route doubles into `vi.hoisted` factories;
- preserves authentication, exact-head, idempotency, fail-closed, and no-carry-forward approval behavior.

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

The recovery head must execute and pass:

1. Typecheck
2. Lint
3. Unit Tests
4. Guarded Terminal and AI Skill Contracts
5. Migration lint
6. Production Build

Any job with no executed steps remains infrastructure evidence. Any executed failing step remains a code or configuration defect until corrected and rerun at the exact head.

## Rollback

Delete the child branch or close its draft pull request. The parent PR #35 remains untouched, the production database remains unchanged, and no deployment state changes.
