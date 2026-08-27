-- Production-recorded migration identity: 20260718042028_steady_state_cron.
--
-- Production historically scheduled steady-state maintenance against the retired
-- cross-project user_onboarding_state mirror. The preceding production-recorded
-- onboarding migration is intentionally a no-op on clean replay, so this fossil
-- MUST NOT recreate, alter, or schedule work against that retired table.
--
-- Existing production cron jobs and table state are intentionally not dropped or
-- mutated here. Any live cleanup requires separate database and data-retention
-- authority with provider readback and rollback evidence.

select 1;
