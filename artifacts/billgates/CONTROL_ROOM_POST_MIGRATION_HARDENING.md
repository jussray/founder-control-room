# Control Room Post-Migration Hardening

## Decision

The guarded terminal reconciliation migration was merged and applied only after its exact PR head executed and passed CI, migration lint, terminal/AI contracts, tests, and production build.

The first live advisor pass then found three issues attributable to the new schema:

1. `approval_executions` had both its UNIQUE-constraint index and a duplicate manual unique index;
2. `approval_executions.project_id` lacked a covering index;
3. the new service-role-only RLS policies called `auth.role()` per row instead of once per statement.

The advisor also identified missing foreign-key indexes on `change_proposals.mission_id` and `releases.change_proposal_id`, both tables reconciled by the same migration.

## OODA

### Observe

- migration history contains `guarded_terminal_and_schema_reconciliation`;
- `approval_executions` and `terminal_runs` exist with RLS enabled;
- anon and authenticated roles have no table grants;
- exact-SHA, timeout, output-bound, status, and one-active-run constraints exist;
- the private hair repository is registered as a distinct high-risk project;
- Supabase reported one duplicate index, one new unindexed foreign key, and two new RLS initialization-plan warnings.

### Orient

The durable fix is a narrow forward migration. Editing production directly would break migration provenance. Broadly rewriting old tables or removing unused indexes would exceed the evidence.

### Decide

- retain the UNIQUE-constraint-owned idempotency index;
- remove only the duplicate manual index;
- add covering indexes to the touched foreign keys;
- preserve service-role-only policy semantics while changing `auth.role()` to `(select auth.role())`;
- leave unrelated historical advisor notices for separate measured work.

### Act

Apply `20260718034000_harden_guarded_terminal_advisors.sql` only after its exact head passes real migration lint and repository gates.

## Red Team I: premise

The terminal schema should not be declared complete merely because the migration succeeded. Live advisors and catalog inspection are required because duplicate indexes and RLS planner behavior are runtime properties.

## Lindy screen

The fix uses ordinary PostgreSQL indexes, policies, transactions, and forward migrations. It adds no provider-specific service and changes no application API.

## L99 authority model

This migration changes database performance and policy implementation only. It does not:

- enable the terminal;
- expose it remotely;
- create a workspace;
- approve a mission;
- authorize a command, merge, deployment, outreach, price change, purchase, or customer action;
- widen client access.

No approval carries forward from the first migration.

## Red Team II: plan

Failure modes considered:

- dropping the wrong idempotency index;
- widening RLS while optimizing it;
- indexing every advisor notice without workload evidence;
- treating an unused-index warning immediately after creation as proof the index is unnecessary;
- applying SQL outside migration history.

Controls:

- drop the explicitly redundant index by exact name;
- retain the UNIQUE constraint index;
- recreate policies with identical role and command boundaries;
- restrict new indexes to foreign keys on tables changed by the guarded-terminal migration;
- require exact-head CI and post-application advisor verification.

## Rollback

Prefer roll-forward. If this migration causes a verified regression:

1. recreate `approval_executions_idempotency` only if the constraint-owned index is absent or unusable;
2. drop the three added covering indexes by exact name;
3. restore the prior policy expressions through a new timestamped migration;
4. preserve all audit rows and migration history.

## Definition of done

- exact-head CI and migration lint execute and pass;
- migration is merged with expected-head protection;
- migration is applied through Supabase migration history;
- duplicate-index and new-table auth-initplan warnings are gone;
- anon and authenticated access remains absent;
- terminal stays disabled until a reviewed local workspace and mission proof exist.
