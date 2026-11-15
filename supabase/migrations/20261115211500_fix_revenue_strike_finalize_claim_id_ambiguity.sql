-- Fix ambiguous column reference in finalize_revenue_strike_customer_send_lease.
--
-- The function declares an OUT column named claim_id (RETURNS TABLE), so the
-- unqualified `claim_id`, `provider_outcome` and `finalized_at` references in
-- its UPDATE ... WHERE clause are ambiguous between the OUT variables and the
-- table columns. `supabase db lint` reports SQLSTATE 42702
-- (column reference "claim_id" is ambiguous) and the function would raise the
-- same error at runtime on its first finalize call.
--
-- This migration replaces only the function body: the UPDATE now uses a table
-- alias for every column reference. Signature, return shape, security
-- definer, search_path, behaviour, grants and comment are unchanged
-- (CREATE OR REPLACE keeps existing privileges; they are re-asserted below).
--
-- Source-only until an explicitly authorized apply; committing it performs no
-- provider or production database mutation.

begin;

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
    from public.revenue_strike_customer_send_leases l
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
