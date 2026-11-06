\set ON_ERROR_STOP on

-- Isolated Neon proof for legacy-function repair; never a production schema
-- apply. Neon does not carry canonical Supabase's truth/revenue prerequisites.
-- Construct them from the historical source and test only the new behavior.

-- Match the canonical Supabase pgcrypto installation without changing any
-- production authority schema or permitting a digest bypass.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

\ir ../migrations/20260912191500_revenue_strike_customer_send_gate.sql

-- Minimal test-only digest-function signature. CI's full Supabase reset and
-- lint independently compile the actual historical truth-console function.
create or replace function public.truth_console_reconcile_claim(
  p_claim_id uuid, p_expected_revision bigint
) returns jsonb language plpgsql security invoker
set search_path = public, pg_temp
as $truth_preview$
begin
  return jsonb_build_object(
    'fingerprint',encode(digest(convert_to('ci-preview-only','UTF8'),'sha256'),'hex')
  );
end;
$truth_preview$;

\ir ../migrations/20261106223000_repair_existing_function_lint.sql

begin;
DO $proof$
declare
  claimed record;
  final_result record;
  repeat_count integer;
  fingerprint text;
begin
  select t->>'fingerprint' into fingerprint
    from (select public.truth_console_reconcile_claim(null, 0) as t) as preview;
  if fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'pgcrypto digest remains unresolved';
  end if;

  select * into claimed
    from public.claim_revenue_strike_customer_send_lease(
      'ci-preview-run',1,'ci-preview-founder',repeat('a',64),
      repeat('b',64),repeat('c',64),repeat('d',64),repeat('e',64),
      now() - interval '1 minute','ci-preview-actor',now()
    );
  if claimed.claim_id is null or claimed.run_id <> 'ci-preview-run'
     or claimed.slot <> 1 then
    raise exception 'First customer lease could not be claimed';
  end if;

  select * into final_result
    from public.finalize_revenue_strike_customer_send_lease(
      claimed.claim_id, 'ci-preview-founder','unknown',null,now()
    );
  if final_result.claim_id <> claimed.claim_id
     or final_result.provider_outcome <> 'unknown'
     or final_result.finalized_at is null then
    raise exception 'Unknown provider outcome failed to finalize';
  end if;

  select count(*) into repeat_count
    from public.claim_revenue_strike_customer_send_lease(
      'ci-preview-run',2,'ci-preview-founder',repeat('a',64),
      repeat('b',64),repeat('c',64),repeat('d',64),repeat('e',64),
      now() - interval '1 minute','ci-preview-actor',now()
    );
  if repeat_count <> 0 then
    raise exception 'Previously consumed recipient was claimed twice';
  end if;

  select count(*) into repeat_count
    from public.finalize_revenue_strike_customer_send_lease(
      claimed.claim_id,'ci-preview-founder','accepted','fake-id',now()
    );
  if repeat_count <> 0 then
    raise exception 'Terminal unknown outcome was reopened';
  end if;
end;
$proof$;
rollback;
