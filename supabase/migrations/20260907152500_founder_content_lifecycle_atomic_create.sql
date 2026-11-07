-- Atomic draft creation for the provider-neutral founder-content lifecycle.
-- Source-only until an explicitly authorized database apply.

begin;

create or replace function public.create_founder_content_post_draft(
  p_post_id uuid,
  p_founder_user_id text,
  p_provider text,
  p_platform text,
  p_account_id text,
  p_title text,
  p_public_payload jsonb,
  p_content_hash text,
  p_media_count integer,
  p_scheduled_at timestamptz,
  p_actor text,
  p_created_at timestamptz default now()
)
returns public.founder_content_posts
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $function$
declare
  inserted public.founder_content_posts%rowtype;
begin
  if p_post_id is null
     or coalesce(btrim(p_founder_user_id), '') = ''
     or coalesce(btrim(p_provider), '') !~ '^[a-z0-9][a-z0-9._:-]{0,159}$'
     or coalesce(btrim(p_platform), '') !~ '^[a-z0-9][a-z0-9._-]{0,79}$'
     or length(btrim(coalesce(p_account_id, ''))) not between 1 and 240
     or p_public_payload is null
     or jsonb_typeof(p_public_payload) <> 'object'
     or coalesce(btrim(p_content_hash), '') !~ '^[0-9a-f]{64}$'
     or p_media_count not between 0 and 100
     or coalesce(btrim(p_actor), '') = ''
     or p_created_at is null then
    raise exception 'FOUNDER_CONTENT_DRAFT_INPUT_INVALID';
  end if;

  insert into public.founder_content_posts (
    post_id,
    founder_user_id,
    provider,
    platform,
    account_id,
    title,
    public_payload,
    content_hash,
    media_count,
    status,
    provider_write_state,
    scheduled_at,
    created_at,
    updated_at
  ) values (
    p_post_id,
    btrim(p_founder_user_id),
    btrim(p_provider),
    btrim(p_platform),
    btrim(p_account_id),
    coalesce(p_title, ''),
    p_public_payload,
    lower(btrim(p_content_hash)),
    p_media_count,
    'pending_approval',
    'not_attempted',
    p_scheduled_at,
    p_created_at,
    p_created_at
  ) returning * into inserted;

  insert into public.founder_content_post_events (
    post_id,
    founder_user_id,
    event_type,
    actor,
    payload,
    observed_at
  ) values (
    inserted.post_id,
    inserted.founder_user_id,
    'draft_created',
    btrim(p_actor),
    jsonb_build_object(
      'provider', inserted.provider,
      'platform', inserted.platform,
      'account_id', inserted.account_id,
      'content_hash', inserted.content_hash,
      'media_count', inserted.media_count,
      'scheduled_at', inserted.scheduled_at,
      'provider_write_attempted', false
    ),
    p_created_at
  );

  return inserted;
end;
$function$;

revoke all on function public.create_founder_content_post_draft(
  uuid, text, text, text, text, text, jsonb, text, integer, timestamptz, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.create_founder_content_post_draft(
  uuid, text, text, text, text, text, jsonb, text, integer, timestamptz, text, timestamptz
) to service_role;

comment on function public.create_founder_content_post_draft(
  uuid, text, text, text, text, text, jsonb, text, integer, timestamptz, text, timestamptz
) is
  'Atomically creates one provider-neutral founder-content draft and its append-only creation receipt. It grants no approval, cadence, provider credential, schedule execution, or publication authority.';

commit;
