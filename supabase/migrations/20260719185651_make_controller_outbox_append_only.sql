-- =============================================================================
-- Make controller_outbox append-only.
--
-- Provider delivery deduplication already occurs in provider_events. A permanent
-- uniqueness constraint on controller_outbox caused completed rows to absorb
-- later events and retry requests while remaining unclaimable because
-- completed_at stayed set. Removing that constraint preserves every legitimate
-- work request and keeps completed history immutable.
-- =============================================================================

alter table public.controller_outbox
  drop constraint if exists controller_outbox_coalesce;

create index if not exists idx_outbox_resource_history
  on public.controller_outbox (
    project_id,
    controller,
    resource_id,
    available_at desc
  );

comment on table public.controller_outbox is
  'Append-only durable reconciliation work. Provider-event deduplication belongs in provider_events; completed rows are never reused for later work.';
