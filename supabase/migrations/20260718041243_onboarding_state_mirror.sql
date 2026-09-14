-- Production-recorded migration identity: 20260718041243_onboarding_state_mirror.
--
-- IMPORTANT: production historically applied a Se'kret Bip per-user onboarding
-- mirror at this version. That cross-project mirror is outside the current
-- Founder Control Room data boundary and MUST NOT be recreated by a clean
-- database replay.
--
-- The live production table is intentionally not dropped here. Existing rows
-- require a separately authorized data-retention / migration decision before
-- any destructive cleanup. Keeping this file as a no-op preserves the remote
-- migration identity while making new environments fail closed on the retired
-- cross-project data flow.

select 1;
