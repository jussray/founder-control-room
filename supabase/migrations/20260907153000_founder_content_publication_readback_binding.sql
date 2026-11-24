-- Bind lifecycle publication truth to the exact canonical FCR execution.
-- Source-only until an explicitly authorized database apply.

begin;

create or replace function public.sync_founder_content_post_publication_result(
  p_post_id uuid,
  p_founder_user_id text,
  p_execution_id uuid,
  p_truth_state text,
  p_external_post_id text,
  p_permalink text,
  p_published_at timestamptz,
  p_error text,
  p_actor text,
  p_observed_at timestamptz default now()
)
returns public.founder_content_posts
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $function$
declare
  post_row public.founder_content_posts%rowtype;
  execution_row public.approval_executions%rowtype;
  updated_row public.founder_content_posts%rowtype;
  normalized_truth text := upper(btrim(coalesce(p_truth_state, '')));
  audit_persisted boolean;
begin
  if p_post_id is null
     or p_execution_id is null
     or coalesce(btrim(p_founder_user_id), '') = ''
     or normalized_truth not in ('PUBLISHED', 'FAILED', 'UNKNOWN')
     or coalesce(btrim(p_actor), '') = ''
     or p_observed_at is null then
    raise exception 'FOUNDER_CONTENT_PUBLICATION_SYNC_INPUT_INVALID';
  end if;

  select p.*
    into post_row
    from public.founder_content_posts p
   where p.post_id = p_post_id
     and p.founder_user_id = btrim(p_founder_user_id)
   for update;
  if not found then
    raise exception 'FOUNDER_CONTENT_POST_NOT_FOUND';
  end if;

  select e.*
    into execution_row
    from public.approval_executions e
   where e.id = p_execution_id
     and e.action_type = 'publish_founder_content'
     and lower(coalesce(e.request->>'publicPayloadHash', '')) = post_row.content_hash
     and lower(coalesce(e.request->>'approvalId', '')) = lower(coalesce(post_row.approval_id, ''));
  if not found then
    raise exception 'FOUNDER_CONTENT_PUBLICATION_EXECUTION_MISMATCH';
  end if;

  audit_persisted := execution_row.status in ('succeeded', 'failed') and execution_row.executed_at is not null;

  if post_row.status = 'posted' then
    if normalized_truth = 'PUBLISHED'
       and post_row.execution_id = p_execution_id
       and post_row.external_post_id = btrim(p_external_post_id)
       and post_row.permalink = btrim(p_permalink) then
      return post_row;
    end if;
    raise exception 'FOUNDER_CONTENT_PUBLICATION_ALREADY_FINAL';
  end if;

  if post_row.status not in ('approved', 'scheduled', 'failed', 'outcome_unknown') then
    raise exception 'FOUNDER_CONTENT_PUBLICATION_POST_STATE_INVALID:%', post_row.status;
  end if;

  if normalized_truth = 'PUBLISHED' then
    if coalesce(btrim(p_external_post_id), '') = ''
       or coalesce(btrim(p_permalink), '') !~ '^https://'
       or p_published_at is null then
      raise exception 'FOUNDER_CONTENT_PUBLICATION_RECEIPT_INVALID';
    end if;

    update public.founder_content_posts
       set status = 'posted',
           provider_write_state = 'verified_published',
           execution_id = p_execution_id,
           posted_at = p_published_at,
           external_post_id = btrim(p_external_post_id),
           permalink = btrim(p_permalink),
           last_error = null,
           updated_at = p_observed_at
     where post_id = post_row.post_id
     returning * into updated_row;
  elsif normalized_truth = 'FAILED' then
    if execution_row.status <> 'failed'
       or coalesce(execution_row.result->>'truthState', '') <> 'FAILED' then
      raise exception 'FOUNDER_CONTENT_PUBLICATION_FAILED_READBACK_UNPROVEN';
    end if;

    update public.founder_content_posts
       set status = 'failed',
           provider_write_state = 'verified_failed',
           execution_id = p_execution_id,
           last_error = coalesce(nullif(btrim(p_error), ''), execution_row.result->>'errorCode', 'provider rejected publication'),
           updated_at = p_observed_at
     where post_id = post_row.post_id
     returning * into updated_row;
  else
    if execution_row.status <> 'failed'
       or coalesce(execution_row.result->>'truthState', '') <> 'UNKNOWN' then
      raise exception 'FOUNDER_CONTENT_PUBLICATION_UNKNOWN_READBACK_UNPROVEN';
    end if;

    update public.founder_content_posts
       set status = 'outcome_unknown',
           provider_write_state = 'unknown',
           execution_id = p_execution_id,
           last_error = coalesce(nullif(btrim(p_error), ''), 'provider outcome is ambiguous; do not retry blindly'),
           updated_at = p_observed_at
     where post_id = post_row.post_id
     returning * into updated_row;
  end if;

  insert into public.founder_content_post_events (
    post_id, founder_user_id, event_type, actor, payload, observed_at
  ) values (
    updated_row.post_id,
    updated_row.founder_user_id,
    'publication_readback',
    btrim(p_actor),
    jsonb_build_object(
      'truth_state', normalized_truth,
      'execution_id', p_execution_id,
      'execution_status', execution_row.status,
      'audit_persisted', audit_persisted,
      'external_post_id', updated_row.external_post_id,
      'permalink', updated_row.permalink,
      'published_at', updated_row.posted_at,
      'provider_write_attempted', true,
      'blind_retry_allowed', false
    ),
    p_observed_at
  );

  return updated_row;
end;
$function$;

revoke all on function public.sync_founder_content_post_publication_result(
  uuid, text, uuid, text, text, text, timestamptz, text, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.sync_founder_content_post_publication_result(
  uuid, text, uuid, text, text, text, timestamptz, text, text, timestamptz
) to service_role;

comment on function public.sync_founder_content_post_publication_result(
  uuid, text, uuid, text, text, text, timestamptz, text, text, timestamptz
) is
  'Synchronizes lifecycle publication truth only when an exact publish_founder_content approval_executions row binds the same public payload hash and approval id. PUBLISHED may preserve provider readback even when final audit persistence failed; FAILED/UNKNOWN require matching durable execution truth. Never authorizes or retries a provider write.';

commit;
