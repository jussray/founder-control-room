# Supabase DB Push — Deploy Failure Runbook

Status: OPEN incident. Documented 2026-07-24.

This runbook records a persistent `Deploy` workflow failure at the `Supabase DB Push`
job (`supabase-migrate`) on `main`, its verified root causes, and the gated remediation.

## Failure signature

`Deploy` fails at its first job, `Supabase DB Push`, in roughly 10-14 seconds.
Because `worker-deploy`, `smoke-test`, and `reconcile` all chain via `needs:`,
every downstream job is reported as **skipped**, not failed. No Worker deploy,
no smoke test, and no reconciliation has run for the duration of this incident.

Observed consecutive failing runs on `main`:

| Run ID | Commit | Finished (UTC) |
| --- | --- | --- |
| 30070291288 | b665648 | 2026-07-24 (pre-merge) |
| 30072294966 | 19ad914 | 06:27:09 |
| 30073375194 | 19c6707 | 06:48:28 |
| 30074435540 | 33d010b | 07:07:59 |
| 30075951947 | a7bc2cd | 07:35:17 |

The failure is independent of the diff: it reproduces on every commit regardless
of content. A failure that does not vary with the change under test points at the
pipeline or its dependencies, not at the code.

## Root causes

All three are verified by reading `.github/workflows/deploy.yml` at `main`.

### 1. `supabase db push` runs without a non-interactive flag

```yaml
run: |
  supabase db push \
    --db-url "$SUPABASE_DB_URL"
```

`supabase db push` prompts for confirmation before applying migrations. GitHub
Actions runners have no TTY, so the prompt cannot be answered and the command
exits non-zero almost immediately. This is consistent with the observed 10-14s
runtime, which is too short for any migration to have been attempted.

Remediation: pass `--yes` to confirm non-interactively.

### 2. `supabase/setup-cli` is unpinned

```yaml
- uses: supabase/setup-cli@v1
  with:
    version: latest
```

`version: latest` resolves at run time. A new Supabase CLI release therefore
changes deploy behaviour with no commit to this repository. This is the most
likely explanation for a pipeline that worked and then began failing on every
commit without a related code change.

Remediation: pin `version` to a known-good release. The last-known-good version
is **not recorded** and must be established before pinning — see UNKNOWN below.

### 3. Seven migration files violate the timestamp naming convention

Supabase expects `<14-digit-UTC-timestamp>_name.sql`. These files in
`supabase/migrations` do not conform:

- `0001_init.sql`
- `0002_enable_rls_and_founder_policy.sql`
- `0003_harden_functions.sql`
- `002_lanes_missions_events.sql`
- `20260711_proof_gate_results_rls_fix.sql`
- `20260713_proof_gate_results_add_failures.sql`
- `20260715_mcp_hub_phase1.sql`

Newer CLI versions reject non-conforming names, which compounds root cause 2.

**Ordering defect.** The short-prefix files sort lexicographically as
`0001_init` -> `0003_harden_functions` -> `002_lanes_missions_events`, because
`'0' < '2'` at the third character. `002_lanes_missions_events.sql` therefore
applies *after* `0003_harden_functions.sql`, not before it. Any assumption that
these run in numeric order is wrong.

**Duplicate logical migrations.** Two pairs share a name at different timestamps:

- `20260713080000_reconciliation_function_hardening.sql` and
  `20260717042000_reconciliation_function_hardening.sql`
- `20260715073000_harden_reconciliation_queue_and_leases.sql` and
  `20260715104852_harden_reconciliation_queue_and_leases.sql`

These are replay hazards and should be reconciled deliberately, not incidentally.

## Remediation and gating

Root causes 1 and 2 change how migrations are applied to the **production**
database. Under `docs/FOUNDER_MERGE_AUTHORITY.md`, "database migration or
destructive data writes" and "production deployment or public release" are
explicitly excluded from standing merge authority and require their own approval.
The workflow fix is therefore raised as a separate, separately gated pull request.

Root cause 3 must **not** be bundled with 1 and 2. Renaming migration files
rewrites migration history; if any of the seven are already applied to the remote
database, renaming them will desynchronise history and require
`supabase migration repair`. Fix 1 and 2 first, confirm a green deploy, then
address naming as an isolated change.

## Evidence classification

**VERIFIED**
- Contents of `.github/workflows/deploy.yml` at `main`, including the exact
  `db push` invocation, the unpinned `setup-cli` version, and the `needs:` chain.
- Full file listing of `supabase/migrations`, including the seven non-conforming
  names and the two duplicate pairs.
- The five failing run IDs, commits, and finish times listed above.

**INFERRED**
- That the missing `--yes` flag is the proximate cause of the immediate exit.
  Reasoning: runtime is far too short for migration work, all downstream jobs are
  skipped rather than failed, and the failure does not vary with the diff.
  Not confirmed against job logs.
- That a Supabase CLI release is the trigger for onset. Reasoning: `version: latest`
  is the only input to this job that can change without a commit.

**UNKNOWN**
- The exact error text emitted by `Supabase DB Push`. GitHub Actions job logs and
  artifacts require authentication and are not readable through the connected
  automation surface, which exposes no workflow-run or job-log action. The two
  reported annotations on the failing job have not been read.
- The last-known-good `supabase/setup-cli` version. Required before pinning.
- Whether `SUPABASE_DB_URL` is correctly populated for the `production`
  environment. The job declares `environment: production`; if the secret is scoped
  at repository level only, `--db-url` would receive an empty string and fail fast
  in a manner indistinguishable from the prompt failure.

## Next action

Open run `30075951947` while authenticated and read the two annotations on the
`Supabase DB Push` job. That single read resolves the first UNKNOWN and confirms
or eliminates the `--yes` hypothesis. Pin the run ID rather than the branch head:
`main` is advancing faster than this incident is being triaged.
