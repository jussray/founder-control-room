-- Atomically bind one-shot founder-content approval consumption to the exact
-- approval_executions reservation generation that owns the provider operation.
--
-- This closes the stale-worker gap between an execution-generation fence and a
-- separate founder_content_approvals UPDATE. The function is source-only until
-- an explicitly authorized migration apply; no provider mutation is performed
-- by committing this file.

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
  -- Marking approval_claimed prevents a stale pre-claim readback from later
  -- rearming an execution whose one-shot authority has already been consumed.
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
  'Atomically consumes an exact live founder-content approval only while the supplied pending approval_executions.started_at generation still owns the same proposal/copy/authorization. Marks approval_claimed in the execution audit so stale pre-claim recovery cannot rearm consumed authority.';