do $migration$
begin
  if to_regclass('stripe.sync_runs') is not null then
    execute $function$
      create or replace function public.stripe_sync_witness_v1()
      returns jsonb
      language plpgsql
      stable
      security definer
      set search_path = pg_catalog
      as $body$
      declare
        witness jsonb;
      begin
        execute $sql$
          select jsonb_build_object(
            'available', true,
            'proof_scope', 'latest_full_sync_run',
            'run_present', true,
            'started_at', started_at,
            'closed_at', closed_at,
            'triggered_by', triggered_by,
            'total_processed', total_processed,
            'total_objects', total_objects,
            'complete_count', complete_count,
            'error_count', error_count,
            'running_count', running_count,
            'pending_count', pending_count,
            'status', status,
            'error_present', (error_message is not null),
            'reconciliation_proven', (
              status = 'complete'
              and closed_at is not null
              and coalesce(error_count, 0) = 0
              and coalesce(running_count, 0) = 0
              and coalesce(pending_count, 0) = 0
            )
          )
          from stripe.sync_runs
          order by started_at desc
          limit 1
        $sql$ into witness;

        return coalesce(
          witness,
          jsonb_build_object(
            'available', true,
            'proof_scope', 'latest_full_sync_run',
            'run_present', false,
            'reconciliation_proven', false
          )
        );
      end;
      $body$;
    $function$;
  else
    execute $function$
      create or replace function public.stripe_sync_witness_v1()
      returns jsonb
      language sql
      stable
      security definer
      set search_path = pg_catalog
      as $body$
        select jsonb_build_object(
          'available', false,
          'proof_scope', 'latest_full_sync_run',
          'reason', 'stripe_sync_ledger_unavailable'
        );
      $body$;
    $function$;
  end if;
end;
$migration$;

revoke all on function public.stripe_sync_witness_v1() from public;
revoke all on function public.stripe_sync_witness_v1() from anon;
revoke all on function public.stripe_sync_witness_v1() from authenticated;
grant execute on function public.stripe_sync_witness_v1() to service_role;

comment on function public.stripe_sync_witness_v1() is
  'Service-role-only, sanitized witness over Stripe Sync provider run metadata. Uses a fail-closed fallback when the provider ledger is not installed.';
