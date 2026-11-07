create table if not exists public.authority_receipt_consumptions (
  receipt_id text primary key,
  consumed_at timestamptz not null,
  repository text not null,
  head_sha text not null check (head_sha ~ '^[0-9a-f]{40}$'),
  action_type text not null,
  created_at timestamptz not null default now()
);

alter table public.authority_receipt_consumptions enable row level security;

revoke all on table public.authority_receipt_consumptions from public;
revoke all on table public.authority_receipt_consumptions from anon;
revoke all on table public.authority_receipt_consumptions from authenticated;

grant select, insert on table public.authority_receipt_consumptions to service_role;

create or replace function public.claim_authority_receipt_consumption(
  p_receipt_id text,
  p_consumed_at timestamptz,
  p_repository text,
  p_head_sha text,
  p_action_type text
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  inserted_count integer;
  normalized_head_sha text;
begin
  if p_receipt_id is null or btrim(p_receipt_id) = '' then
    raise exception 'receipt_id is required';
  end if;
  if p_repository is null or btrim(p_repository) = '' then
    raise exception 'repository is required';
  end if;
  if p_head_sha !~* '^[0-9a-f]{40}$' then
    raise exception 'head_sha must be a 40-character hexadecimal commit SHA';
  end if;
  if p_action_type is null or btrim(p_action_type) = '' then
    raise exception 'action_type is required';
  end if;

  normalized_head_sha := lower(p_head_sha);

  insert into public.authority_receipt_consumptions (
    receipt_id,
    consumed_at,
    repository,
    head_sha,
    action_type
  ) values (
    p_receipt_id,
    p_consumed_at,
    p_repository,
    normalized_head_sha,
    p_action_type
  )
  on conflict (receipt_id) do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count = 1;
end;
$$;

revoke execute on function public.claim_authority_receipt_consumption(text, timestamptz, text, text, text) from public;
revoke execute on function public.claim_authority_receipt_consumption(text, timestamptz, text, text, text) from anon;
revoke execute on function public.claim_authority_receipt_consumption(text, timestamptz, text, text, text) from authenticated;
grant execute on function public.claim_authority_receipt_consumption(text, timestamptz, text, text, text) to service_role;
