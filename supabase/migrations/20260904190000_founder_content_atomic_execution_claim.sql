-- Atomically bind one-shot founder-content approval consumption to the exact
-- approval_executions reservation generation that owns the provider operation.
-- Also keep abandoned pre-claim recovery atomic with the approval_claimed flag,
-- so a stale recovery read cannot overwrite a claim that completed meanwhile.
--
-- This migration is source-only until an explicitly authorized apply. Merely
-- committing it performs no provider or production database mutation.

create function public.claim_founder_content_approval_for_execution_generation(
  p_execution_id uuid,
  p_expected_started_at timestamptz,
  p_approval_id text,
  p_founder_user_id text,
  p_proposal_hash text,
  p_public_payload_hash text,
  p_authorization_hash text,
  p_consumed_by text,
  p_claimed_at timestamptz
)
returns table (
  approval jsonb,
  approval_id text,
  authorization_hash text,
  public_payload_hash text,
  execution_started_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $function$
declare
  execution_row public.approval_executions%rowtype;
  approval_row public.founder_content_approvals%rowtype;
begin
  if p_execution_id is null or p_expected_started_at is null then
    return;
  end if;
  if coalesce(btrim(p_approval_id), '') = ''
    or coalesce(btrim(p_founder_user_id), '') = ''
    or coalesce(btrim(p_consumed_by), '') = ''
    or p_claimed_at is null then
    return;
  end if;

  -- Lock the exact worker generation first. A concurrent rearm must either win
  -- before this SELECT (making this generation miss) or wait until this
  -- transaction commits. It can never interleave between the fence and claim.
  select e.*
    into execution_row
    from public.approval_executions e
   where e.id = p_execution_id
     and e.status = 'pending'
     and e.started_at = p_expected_started_at
     and coalesce(e.result->>'provider_write_attempted', 'false') = 'false'
     and coalesce(e.result->>'approval_claimed', 'false') = 'false'
     and e.request->>'proposalHash' = lower(btrim(p_proposal_hash))
     and e.request->>'publicPayloadHash' = lower(btrim(p_public_payload_hash))
     and e.request->>'authorizationHash' = lower(btrim(p_authorization_hash))
   for update;

  if not found then
    return;
  end if;

  -- Lock the exact one-shot approval under the same transaction. No approval is
  -- consumed unless the execution generation above is still authoritative.
  select a.*
    into approval_row
    from public.founder_content_approvals a
   where a.approval_id = lower(btrim(p_approval_id))
     and a.founder_user_id = btrim(p_founder_user_id)
     and a.proposal_hash = lower(btrim(p_proposal_hash))
     and a.public_payload_hash = lower(btrim(p_public_payload_hash))
     and a.authorization_hash = lower(btrim(p_authorization_hash))
     and a.revoked_at is null
     and a.consumed_at is null
     and a.expires_at > p_claimed_at
   for update;

  if not found then
    return;
  end if;

  update public.founder_content_approvals
     set consumed_at = p_claimed_at,
         consumed_by = btrim(p_consumed_by)
   where approval_id = approval_row.approval_id;

  -- Preserve the generation token. Provider-write acquisition, abort, and
  -- finalization continue to fence on this same database-returned started_at.
  update public.approval_executions
     set result = coalesce(execution_row.result, '{}'::jsonb)
       || jsonb_build_object(
            'phase', 'approval_claimed',
            'approval_claimed', true,
            'provider_write_attempted', false,
            'approval_id', approval_row.approval_id
          )
   where id = execution_row.id
     and status = 'pending'
     and started_at = execution_row.started_at;

  return query
    select
      approval_row.approval,
      approval_row.approval_id,
      approval_row.authorization_hash,
      approval_row.public_payload_hash,
      execution_row.started_at;
end;
$function$;

revoke all on function public.claim_founder_content_approval_for_execution_generation(
  uuid, timestamptz, text, text, text, text, text, text, timestamptz
) from public;
revoke all on function public.claim_founder_content_approval_for_execution_generation(
  uuid, timestamptz, text, text, text, text, text, text, timestamptz
) from anon;
revoke all on function public.claim_founder_content_approval_for_execution_generation(
  uuid, timestamptz, text, text, text, text, text, text, timestamptz
) from authenticated;
grant execute on function public.claim_founder_content_approval_for_execution_generation(
  uuid, timestamptz, text, text, text, text, text, text, timestamptz
) to service_role;

comment on function public.claim_founder_content_approval_for_execution_generation(
  uuid, timestamptz, text, text, text, text, text, text, timestamptz
) is
  'Atomically consumes an exact live founder-content approval only while the supplied pending approval_executions.started_at generation still owns the same proposal/copy/authorization. Marks approval_claimed so stale pre-claim recovery cannot rearm consumed authority.';

create function public.rearm_founder_content_preclaim_execution(
  p_execution_id uuid,
  p_expected_status text,
  p_expected_started_at timestamptz,
  p_new_started_at timestamptz,
  p_executed_by text,
  p_request jsonb,
  p_resumed_from_failed boolean,
  p_resumed_from_abandoned boolean
)
returns table (
  execution_id uuid,
  project_id uuid,
  execution_started_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $function$
declare
  execution_row public.approval_executions%rowtype;
begin
  if p_execution_id is null
    or p_expected_started_at is null
    or p_new_started_at is null
    or p_new_started_at <= p_expected_started_at
    or p_expected_status not in ('pending', 'failed')
    or coalesce(btrim(p_executed_by), '') = '' then
    return;
  end if;

  -- This SELECT/UPDATE pair shares one transaction and locks the exact prior
  -- generation. If approval claiming wins first, approval_claimed=true makes
  -- the recovery miss instead of letting stale readback overwrite live truth.
  select e.*
    into execution_row
    from public.approval_executions e
   where e.id = p_execution_id
     and e.status = p_expected_status
     and e.started_at = p_expected_started_at
     and coalesce(e.result->>'provider_write_attempted', 'false') = 'false'
     and coalesce(e.result->>'approval_claimed', 'false') = 'false'
   for update;

  if not found then
    return;
  end if;

  update public.approval_executions
     set executed_by = btrim(p_executed_by),
         status = 'pending',
         request = coalesce(p_request, '{}'::jsonb),
         result = jsonb_build_object(
           'resumed_from_pre_provider_failure', coalesce(p_resumed_from_failed, false),
           'resumed_from_abandoned_preclaim_reservation', coalesce(p_resumed_from_abandoned, false),
           'approval_claimed', false,
           'provider_write_attempted', false
         ),
         success = null,
         started_at = p_new_started_at,
         executed_at = null
   where id = execution_row.id
     and status = execution_row.status
     and started_at = execution_row.started_at;

  return query
    select execution_row.id, execution_row.project_id, p_new_started_at;
end;
$function$;

revoke all on function public.rearm_founder_content_preclaim_execution(
  uuid, text, timestamptz, timestamptz, text, jsonb, boolean, boolean
) from public;
revoke all on function public.rearm_founder_content_preclaim_execution(
  uuid, text, timestamptz, timestamptz, text, jsonb, boolean, boolean
) from anon;
revoke all on function public.rearm_founder_content_preclaim_execution(
  uuid, text, timestamptz, timestamptz, text, jsonb, boolean, boolean
) from authenticated;
grant execute on function public.rearm_founder_content_preclaim_execution(
  uuid, text, timestamptz, timestamptz, text, jsonb, boolean, boolean
) to service_role;

comment on function public.rearm_founder_content_preclaim_execution(
  uuid, text, timestamptz, timestamptz, text, jsonb, boolean, boolean
) is
  'Rearms only an exact pre-claim founder-content execution generation with no provider-write attempt and no consumed approval, preventing stale recovery readback from overwriting approval_claimed authority.';