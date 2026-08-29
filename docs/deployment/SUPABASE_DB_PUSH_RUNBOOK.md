# Supabase DB Push — Migration History Reconciliation

Status: **SUPERSEDED INCIDENT / ACTIVE RECONCILIATION**

The July 24 deploy-failure diagnosis in the previous version of this document is historical. Its old migration filenames and proposed next action are no longer authoritative.

## Current truth

Founder Control Room production records migration versions that diverged from several historical Git filenames because migrations were applied through provider-side tooling with production timestamps. PR #723 reacquired those production identities in Git instead of attempting a destructive `supabase migration repair` or replaying forked filenames. Current PR #632 carries the follow-up clean-replay and security reconciliation on the latest main.

Current reconciliation rules:

- Production-recorded migration versions are mirrored by same-version files in `supabase/migrations`.
- Known forked historical filenames are rejected by the migration-ledger contract.
- Local pending migrations remain explicit forward migrations. They are not rewritten to impersonate applied production history.
- `supabase db push --dry-run --include-all` remains a **trusted production/default-branch authority step**, not a branch-controlled proof surface.
- Branch-controlled migration proof is secretless and may verify only source identity, ordering, contracts, and immutable local fingerprints.
- Production database credentials must never be exposed to branch-controlled workflow code.

## Security boundary discovered during reconciliation

The production-applied migration `20260718041243_onboarding_state_mirror` historically created a Se'kret Bip onboarding mirror inside FCR. The live FCR database still contains that table and existing rows. The current reconciliation preserves the migration version but retires its body for clean replays. It does **not** drop or mutate the live table. Any export, retention decision, or destructive cleanup requires separate database authority.

The production-applied LinkedIn experiment migration also left an overly broad authenticated policy and a non-`security_invoker` reporting view. PR #632 hardens both clean replay and already-recorded production state to a server-owned `service_role` boundary: it drops `founder_full_access`, revokes direct `anon`/`authenticated` access to the LinkedIn table and reporting view, grants the required table/view privileges to `service_role`, and sets the reporting view to `security_invoker = true`. These source migrations remain unapplied to production until a separately authorized deployment applies the forward reconciliation and provider readback verifies the result.

## Production deploy authority

The canonical deployment workflow is `.github/workflows/deploy.yml`. It is manually dispatched, requires an exact current-main SHA and an auditable production approval reference, performs a pre-push migration ledger check and dry run, then applies migrations only after those gates succeed.

A green branch candidate is not permission to mutate Supabase. A live migration application, migration-history repair, table drop, data export, or destructive cleanup remains a separate provider-side authority event.

## Evidence classification

**VERIFIED**

- Production migration history differs from the former forked Git filenames.
- The production-recorded identities are represented in Git, and PR #632 preserves them while adding the bounded forward reconciliation.
- The branch-controlled migration workflow does not request production secrets or a production environment.
- FCR's general founder authorization uses the server-only `founder_users` allowlist and `is_founder()`, while the LinkedIn experiment objects in this hardening are intentionally `service_role`-only and do not rely on caller founder-RLS access.

**BLOCKED / SEPARATE AUTHORITY**

- Applying the new forward reconciliation migration to production.
- Removing or exporting the existing production onboarding mirror and its data.
- Any credentialed database proof that is not executed from trusted default-branch workflow code.

## Next gate

Verify PR #632 on its final exact head with the normal source, migration, security, and Playwright packet. Resolve material review findings. Only after merge/deployment authority is separately established may the trusted production workflow run its credentialed migration dry run and apply forward migrations. Production application must then read back the migration ledger, retired cron state, preserved onboarding data, and LinkedIn service-role-only access before the provider plane is called reconciled.
