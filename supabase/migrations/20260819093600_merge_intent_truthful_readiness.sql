-- =============================================================================
-- Truthful merge-intent readiness vocabulary
--
-- The current liveness controller proves exact candidate identity/base/head/diff
-- freshness. It does not independently prove the full semantic-review and
-- exact-head machine-evidence policy that /execute evaluates. Therefore that
-- witness is REVALIDATED, not READY. READY remains reserved for a future
-- projection that actually proves every merge-readiness authority.
-- =============================================================================

begin;

alter table merge_intents
  drop constraint if exists merge_intents_state_check;

alter table merge_intents
  add constraint merge_intents_state_check
  check (state in (
    'waiting',
    'revalidated',
    'ready',
    'stale',
    'needs_review',
    'executing',
    'merged',
    'cancelled',
    'expired',
    'blocked'
  ));

comment on column merge_intents.state is
  'Liveness projection only. REVALIDATED means exact approved PR/base/head/diff identity is fresh enough to evaluate the authoritative merge gate. READY is reserved for a future projection that also proves review/evidence policy; neither state independently authorizes provider mutation.';

commit;
