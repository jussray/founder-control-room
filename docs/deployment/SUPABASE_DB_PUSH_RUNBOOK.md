# Supabase DB Push — Migration History Reconciliation

Status: **SUPERSEDED INCIDENT / ACTIVE RECONCILIATION**

The July 24 deploy-failure diagnosis in the previous version of this document is historical. Its old migration filenames and proposed next action are no longer authoritative.

## Current truth

Founder Control Room production records migration versions that diverged from several historical Git filenames because migrations were applied through provider-side tooling with production timestamps. PR #723 reacquires those production identities in Git instead of attempting a destructive `supabase migration repair` or replaying forked filenames.

Current reconciliation rules:

- Production-recorded migration versions are mirrored by same-version files in `supabase/migrations`.
- Known forked historical filenames are rejected by the migration-ledger contract.
- Local pending migrations remain explicit forward migrations. They are not rewritten to impersonate applied production history.
- `supabase db push --dry-run --include-all` remains a **trusted production/default-branch authority step**, not a branch-controlled proof surface.
- Branch-controlled migration proof is secretless and may verify only source identity, ordering, contracts, and immutable local fingerprints.
- Production database credentials must never be exposed to branch-controlled workflow code.

## Security boundary discovered during reconciliation

The production-applied migration `20260718041243_onboarding_state_mirror` historically created a Se'kret Bip onboarding mirror inside FCR. The live FCR database still contains that table and existing rows. PR #723 therefore preserves the migration version but retires its body for clean replays. It does **not** drop or mutate the live table. Any export, retention decision, or destructive cleanup requires separate database authority.

The production-applied LinkedIn experiment migration also left an overly broad authenticated policy and a non-`security_invoker` reporting view. PR #723 layers a forward hardening migration using FCR's existing `is_founder()` allowlist and caller-RLS view semantics. That migration remains unapplied to production until an independently authorized deployment.

## Production deploy authority

The canonical deployment workflow is `.github/workflows/deploy.yml`. It is manually dispatched, requires an exact current-main SHA and an auditable production approval reference, performs a pre-push migration ledger check and dry run, then applies migrations only after those gates succeed.

A green branch candidate is not permission to mutate Supabase. A live migration application, migration-history repair, table drop, data export, or destructive cleanup remains a separate provider-side authority event.

## Evidence classification

**VERIFIED**

- Production migration history differs from the former forked Git filenames.
- The reconciled production versions are represented in PR #723.
- The branch-controlled migration workflow no longer requests production secrets or a production environment.
- FCR's existing founder authorization is based on the server-only `founder_users` allowlist and `is_founder()`.

**BLOCKED / SEPARATE AUTHORITY**

- Applying the new forward hardening migration to production.
- Removing or exporting the existing production onboarding mirror and its data.
- Any credentialed database proof that is not executed from trusted default-branch workflow code.

## Next gate

Verify PR #723 on its final exact head with the normal source, migration, security, and Playwright packet. Resolve material review findings. Only after merge/deployment authority is separately established may the trusted production workflow run its credentialed migration dry run and apply forward migrations.
