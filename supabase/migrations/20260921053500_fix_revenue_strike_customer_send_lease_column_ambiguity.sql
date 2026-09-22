-- Correct PL/pgSQL output-variable / table-column ambiguity in the existing
-- revenue-strike customer-send lease functions.
--
-- Append-only repair: do not rewrite the historical 20260912191500 migration.
-- This migration changes function bodies only. It performs no external provider
-- call and does not widen database or publication authority.

begin;

create or replace function public.claim_revenue_strike_customer_send_lease(
  p_run_id text,
  p_slot smallint,
  p_founder_user_id text,
  p_recipient_fingerprint text,
  p_prospect_fingerprint text,
  p_message_fingerprint text,
  p_offer_fingerprint text,
  p_historical_ledger_digest text,
  p_reply_gate_clear_at timestamptz,
  p_claimed_by text,
  p_claimed_at timestamptz
)
returns table (
  claim_id uuid,
  run_id text,
  slot smallint,
  recipient_fingerprint text,
  claimed_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $function$
declare
  lease_row public.revenue_strike_customer_send_leases%rowtype;
  run_send_count bigint;
begin
  if coalesce(btrim(p_run_id), '') = ''
    or p_slot is null or p_slot not between 1 and 5
    or coalesce(btrim(p_founder_user_id), '') = ''
    or coalesce(btrim(p_claimed_by), '') = ''
    or p_reply_gate_clear_at is null
    or p_claimed_at is null then
    return;
  end if;

  if lower(btrim(p_recipient_fingerprint)) !~ '^[0-9a-f]{64}$'
    or lower(btrim(p_prospect_fingerprint)) !~ '^[0-9a-f]{64}$'
    or lower(btrim(p_message_fingerprint)) !~ '^[0-9a-f]{64}$'
    or lower(btrim(p_offer_fingerprint)) !~ '^[0-9a-f]{64}$'
    or lower(btrim(p_historical_ledger_digest)) !~ '^[0-9a-f]{64}$' then
    return;
  end if;

  if p_reply_gate_clear_at > p_claimed_at
    or p_claimed_at - p_reply_gate_clear_at > interval '15 minutes' then
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(btrim(p_run_id), 0));

  select count(*)
    into run_send_count
    from public.revenue_strike_customer_send_leases as l
   where l.run_id = btrim(p_run_id);

  if run_send_count >= 5 then
    return;
  end if;

  if exists (
    select 1
      from public.revenue_strike_customer_send_leases as l
     where l.recipient_fingerprint = lower(btrim(p_recipient_fingerprint))
  ) then
    return;
  end if;

  if exists (
    select 1
      from public.revenue_strike_customer_send_leases as l
     where l.run_id = btrim(p_run_id)
       and l.slot = p_slot
  ) then
    return;
  end if;

  insert into public.revenue_strike_customer_send_leases (
    run_id,
    slot,
    founder_user_id,
    recipient_fingerprint,
    prospect_fingerprint,
    message_fingerprint,
    offer_fingerprint,
    historical_ledger_digest,
    reply_gate_clear_at,
    claimed_by,
    claimed_at,
    provider_outcome
  ) values (
    btrim(p_run_id),
    p_slot,
    btrim(p_founder_user_id),
    lower(btrim(p_recipient_fingerprint)),
    lower(btrim(p_prospect_fingerprint)),
    lower(btrim(p_message_fingerprint)),
    lower(btrim(p_offer_fingerprint)),
    lower(btrim(p_historical_ledger_digest)),
    p_reply_gate_clear_at,
    btrim(p_claimed_by),
    p_claimed_at,
    'claimed'
  )
  returning * into lease_row;

  return query
    select
      lease_row.claim_id,
      lease_row.run_id,
      lease_row.slot,
      lease_row.recipient_fingerprint,
      lease_row.claimed_at;
exception
  when unique_violation then
    return;
end;
$function$;

revoke all on function public.claim_revenue_strike_customer_send_lease(
  text, smallint, text, text, text, text, text, text, timestamptz, text, timestamptz
) from public;
revoke all on function public.claim_revenue_strike_customer_send_lease(
  text, smallint, text, text, text, text, text, text, timestamptz, text, timestamptz
) from anon;
revoke all on function public.claim_revenue_strike_customer_send_lease(
  text, smallint, text, text, text, text, text, text, timestamptz, text, timestamptz
) from authenticated;
grant execute on function public.claim_revenue_strike_customer_send_lease(
  text, smallint, text, text, text, text, text, text, timestamptz, text, timestamptz
) to service_role;

comment on function public.claim_revenue_strike_customer_send_lease(
  text, smallint, text, text, text, text, text, text, timestamptz, text, timestamptz
) is
  'Atomically consumes one cold-customer send lease. Enforces a five-lease run ceiling, one permanent lease per recipient fingerprint, one lease per run slot, and a fresh reply-first observation before any provider call may occur.';

create or replace function public.finalize_revenue_strike_customer_send_lease(
  p_claim_id uuid,
  p_founder_user_id text,
  p_provider_outcome text,
  p_provider_receipt_id text,
  p_finalized_at timestamptz
)
returns table (
  claim_id uuid,
  provider_outcome text,
  provider_receipt_id text,
  finalized_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $function$
declare
  lease_row public.revenue_strike_customer_send_leases%rowtype;
begin
  if p_claim_id is null
    or coalesce(btrim(p_founder_user_id), '') = ''
    or p_provider_outcome not in ('accepted', 'rejected', 'unknown')
    or p_finalized_at is null
    or (p_provider_outcome = 'accepted' and coalesce(btrim(p_provider_receipt_id), '') = '') then
    return;
  end if;

  select l.*
    into lease_row
    from public.revenue_strike_customer_send_leases as l
   where l.claim_id = p_claim_id
     and l.founder_user_id = btrim(p_founder_user_id)
     and l.provider_outcome = 'claimed'
     and l.finalized_at is null
   for update;

  if not found then
    return;
  end if;

  update public.revenue_strike_customer_send_leases as l
     set provider_outcome = p_provider_outcome,
         provider_receipt_id = nullif(btrim(p_provider_receipt_id), ''),
         finalized_at = p_finalized_at
   where l.claim_id = lease_row.claim_id
     and l.provider_outcome = 'claimed'
     and l.finalized_at is null
  returning l.* into lease_row;

  return query
    select
      lease_row.claim_id,
      lease_row.provider_outcome,
      lease_row.provider_receipt_id,
      lease_row.finalized_at;
end;
$function$;

revoke all on function public.finalize_revenue_strike_customer_send_lease(
  uuid, text, text, text, timestamptz
) from public;
revoke all on function public.finalize_revenue_strike_customer_send_lease(
  uuid, text, text, text, timestamptz
) from anon;
revoke all on function public.finalize_revenue_strike_customer_send_lease(
  uuid, text, text, text, timestamptz
) from authenticated;
grant execute on function public.finalize_revenue_strike_customer_send_lease(
  uuid, text, text, text, timestamptz
) to service_role;

comment on function public.finalize_revenue_strike_customer_send_lease(
  uuid, text, text, text, timestamptz
) is
  'Records the terminal provider outcome for an already-consumed customer-send lease. It never reopens or recreates send authority; unknown outcomes remain consumed and forbid retry.';

commit;
