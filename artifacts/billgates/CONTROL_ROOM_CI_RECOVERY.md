# Founder Control Room Runtime Recovery

## Executive decision

Founder Control Room’s live datastore is reachable, but the deployed control loop is not currently operating as an autonomous system.

Read-only inspection found an empty controller outbox, no reconciliation runs or issue summaries, one expired controller lease, and repository verification activity that had not advanced since July 15, 2026. Se’kret Bip PR #480 had no persisted Control Room failure record.

The repository recovery is now bench-verified. That is not permission to merge, deploy, apply migrations, configure secrets, enable the guarded terminal, or represent the live loop as running.

## Delivery topology

Repository: `jussray/founder-control-room`

Parent feature PR: `#35 Add guarded terminal, proof-gated merges, and AI sales controls`

Correctly stacked recovery PR: `#45 Stacked: recover PR #35 exact-head CI contracts`

Verification-only driver: draft PR `#44 Verify PR #35 recovery at immutable target SHA`

PR #43 targeted `main` even though the recovery branch was a child of PR #35. It mixed the parent feature into the recovery diff and produced a structural conflict. PR #45 targets `codex/guarded-terminal-proof-fix`, isolates the recovery delta, and is the correct delivery path.

## Classification history

### Runner-startup evidence

CI run `29622908334` had failed jobs with no executed steps or logs. Classification: `runner_startup_failure`. That result did not prove a source regression.

### Executed source failures

Quality Gate run `29622908299` later received runners. Lint, unit tests, and typecheck executed and failed, while the guarded terminal and AI contracts passed. Classification changed to `workflow_step_failure`.

Retained artifacts then exposed focused contract defects rather than a terminal-runtime failure:

- proof-gate tests read generated failures from the wrong field;
- CORS tests relied on unsupported dynamic import behavior and private middleware fields;
- approval and terminal route mocks violated Vitest hoisting and constructor semantics;
- reconciliation request/result types had drifted from runtime use;
- middleware imports were absent from the package manifest and lockfile;
- warning-level ESLint policy was contradicted by `--max-warnings 0`;
- migration lint was initially wired without a local database;
- truncated migration filenames collided on the same Supabase migration version;
- the guarded-terminal migration depended on repository-verification columns it did not create in a fresh database.

Those defects were repaired and repeatedly narrowed through immutable driver runs. The guarded terminal contract passed throughout; no evidence supported weakening or rewriting its command restrictions.

## Runtime dead-loop findings

Green source checks alone were not enough. Read-only live-schema comparison and edge-path inspection found additional blockers that explained why the deployed loop could remain silent.

### 1. Unsupported Cloudflare-to-Express bridge

The Worker passed a Fetch `Request` directly into Express with a hand-built partial response object. This was not a real Node HTTP request/response contract.

Recovery:

- use a real `node:http` server;
- wrap it with Cloudflare’s supported `httpServerHandler` adapter;
- enable `enable_nodejs_http_modules` and `enable_nodejs_http_server_modules` while retaining the existing compatibility date;
- combine the HTTP fetch adapter with the scheduled reconciliation handler;
- validate all required Worker bindings before importing environment-backed application modules;
- keep reconciliation loading lazy for scheduled events.

### 2. GitHub webhook body was never parsed

`express.raw()` correctly preserved signed bytes, but the webhook handler cast the `Buffer` directly to an object. Even a valid signature could not produce `repository.full_name`.

Recovery:

- require a raw `Buffer`;
- verify HMAC-SHA256 over the exact bytes;
- parse JSON only after signature success;
- validate GitHub event and delivery headers before persistence.

### 3. Webhook project lookup used nonexistent columns

The route queried `project_connections.provider` and `connection_config`. Live schema uses `connection_type`, `config`, and `status`; active GitHub mappings are stored as `connection_type='git'` with `config.repository`.

Recovery:

- resolve projects through the deployed `connection_type/status/config->>repository` contract;
- add route-level regression coverage for signed webhook ingestion and controller routing.

### 4. Lease acquisition was not exclusive

Controller code used `upsert(... ignoreDuplicates: true)` and treated the absence of an error as ownership. A conflict could therefore let multiple workers believe they held the same lease.

The live database already contained the authoritative `try_acquire_controller_lease` function, but its migration was missing from source control and runtime code did not call it.

Recovery:

- restore deployed migration `20260715104852_harden_reconciliation_queue_and_leases.sql` from read-only migration history;
- acquire through the atomic database RPC;
- read `claimed_at` as an ownership token;
- release only when both `lease_key` and the exact ownership token match, preventing a slow worker from deleting a newer replacement lease.

### 5. Completed outbox rows absorbed later work

The outbox used a permanent unique constraint plus upsert. A later event for the same resource updated an already-completed row without clearing `completed_at`; `claim_outbox_work` would never claim it again. Retry requests could disappear through the same path.

Recovery:

- make `controller_outbox` append-only;
- keep provider-delivery deduplication in `provider_events`;
- insert one durable row for every legitimate reconciliation request;
- remove the permanent coalescing constraint and retain resource-history indexing.

### 6. Work and source-event lifecycle could split

The reconciler completed outbox rows without marking linked provider events processed. Failures could leave provider events permanently pending, and poison work had no terminal retry boundary.

Recovery:

- add service-role-only `complete_outbox_work` and `abandon_outbox_work` RPCs;
- atomically finalize the outbox row and linked provider event in one transaction;
- reschedule retryable work on the same durable row with database-side backoff;
- terminally abandon deterministic unknown-controller work;
- stop retrying poison work after five attempts and persist a blocked reconciliation audit record.

## Migration lineage recovery

The live Supabase migration ledger was inspected read-only. It records these authoritative versions:

- `20260711211416_reconciliation`
- `20260711211452_reconciliation_fix_execute_grants`
- `20260711214937_proof_gate_results`
- `20260715104852_harden_reconciliation_queue_and_leases`

The repository now uses those full versions, restores missing execute-grant and lease hardening migrations, removes truncated duplicate-version files, and adds append-only queue plus atomic lifecycle migrations.

The guarded-terminal migration now creates repository-verification columns, defaults, and cadence constraints before inserting repository settings. No live migration was changed or applied during recovery.

## Verified recovery behavior

The recovery slice now:

- preserves proof-gate immutability through canonical `allFailures`;
- provides typed fail-closed CORS, security headers, rate limiting, and startup binding validation;
- keeps authentication, RLS separation, exact-head verification, immutable-SHA integration, idempotency reservations, no-carry-forward approval, and guarded-terminal restrictions intact;
- uses Cloudflare’s supported Node HTTP server adapter;
- verifies signed raw GitHub webhook bytes before parsing;
- resolves repositories against the deployed connection schema;
- persists every legitimate work request in an append-only outbox;
- uses atomic owner-bound leases;
- atomically finalizes work and provider-event state;
- enforces bounded retry and terminal poison-event handling;
- aligns fresh-database migrations with deployed lineage and security grants;
- includes focused route, Worker, lease, queue, and reconciler lifecycle tests.

## Exact-head proof

Runtime payload head `820adc105a10c8fece5fcf581cfa0261641068eb` was verified by conflict-independent driver run `29628118034`.

All executed jobs passed:

- Exact Target Metadata `88036422450`
- Target Typecheck `88036422438`
- Target Lint `88036422435`
- Target Unit Tests `88036422447`
- Target Terminal and AI Contracts `88036422497`
- Target Production Build `88036422439`
- Target Migration Lint Evidence `88036422443`

The migration job initialized an ephemeral Supabase project, started a fresh local database, applied the complete migration chain, ran `supabase db lint --local --fail-on error`, uploaded diagnostics, and stopped the local stack successfully.

This ledger is a documentation-only commit after that runtime proof. Its final exact-head verification must be recorded on PR #45 without editing this file again.

## Authority and non-actions

This recovery did not:

- merge PR #35, PR #45, or any downstream product PR;
- deploy Founder Control Room or Se’kret Bip;
- apply, repair, or reorder migrations in the live Supabase project;
- configure or rotate production credentials;
- enable local or remote guarded-terminal execution;
- change live authentication, RLS, billing, DNS, customer data, or user data;
- treat stale, wrong-SHA, skipped, runner-less, or partial results as proof.

## Activation gates

Repository verification is necessary but not sufficient for activation. The next separately approved sequence is:

1. Review and integrate the stacked recovery into PR #35.
2. Reverify the resulting PR #35 exact head.
3. Explicitly approve and apply the pending migrations to Founder Control Room Supabase.
4. Verify migration history, function grants, queue constraints, and RLS after apply.
5. Configure and validate all Worker secrets and origins.
6. Deploy the Worker with the supported Node HTTP compatibility flags and cron trigger.
7. Send one signed synthetic GitHub event for a registered sandbox resource.
8. Prove provider event → outbox claim → lease → controller → reconciliation audit → atomic completion.
9. Confirm idle cron health and bounded failure behavior.
10. Keep the guarded terminal disabled until its own separate founder approval.

## Rollback

Before integration, close PR #45 or delete `agent/pr35-ci-recovery`; PR #35 and live production remain unchanged.

After any future integration, rollback is a separate approved action: revert the integration commit, disable the Worker route/cron if deployed, and use migration-specific rollback or forward-repair plans rather than deleting audit history.
