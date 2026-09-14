-- Founder Control Room Connection Vault v1
--
-- Secret VALUES stay in an external secret manager (for example Cloudflare
-- Secrets Store, a Worker secret, or GitHub Actions). FCR stores only opaque
-- secret references plus non-secret variables and governance metadata.
-- FCR API tokens are shown once; only their SHA-256 hashes are persisted.

create table if not exists connection_vault_bindings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  connection_id uuid not null references project_connections(id) on delete cascade,
  environment text not null check (environment in ('development', 'preview', 'production')),
  name text not null check (name ~ '^[A-Z][A-Z0-9_]{1,127}$'),
  kind text not null check (kind in ('secret', 'variable')),
  storage_provider text not null,
  secret_ref text,
  variable_value text,
  status text not null default 'active' check (status in ('active', 'revoked', 'error')),
  last_verified_at timestamptz,
  created_by text not null default 'founder',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, environment, name),
  constraint connection_vault_binding_value_shape check (
    (
      kind = 'secret'
      and secret_ref is not null
      and length(secret_ref) between 6 and 2048
      and secret_ref ~ '^[A-Za-z][A-Za-z0-9+.-]*://[^[:space:]]+$'
      and variable_value is null
    )
    or
    (kind = 'variable' and variable_value is not null and secret_ref is null)
  )
);

comment on table connection_vault_bindings is
  'FCR-owned environment binding metadata. Secret values are never stored here; secret_ref points to provider-held encrypted material.';
comment on column connection_vault_bindings.secret_ref is
  'Opaque URI reference to an external secret-manager entry. Never the secret value itself.';
comment on column connection_vault_bindings.variable_value is
  'Non-secret environment value. Secret-like values belong in the external secret manager and must use kind=secret.';

create table if not exists fcr_api_tokens (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  environment text not null check (environment in ('development', 'preview', 'production')),
  token_prefix text not null unique,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  scopes text[] not null check (cardinality(scopes) between 1 and 20),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  rotated_at timestamptz,
  last_used_at timestamptz,
  usage_count bigint not null default 0 check (usage_count >= 0),
  created_by text not null default 'founder',
  created_at timestamptz not null default now(),
  constraint fcr_api_tokens_future_expiry check (expires_at > created_at)
);

comment on table fcr_api_tokens is
  'Short-lived, project- and environment-scoped FCR workflow tokens. Only SHA-256 hashes and display prefixes are persisted.';
comment on column fcr_api_tokens.token_hash is
  'SHA-256 hash of the one-time-displayed bearer token. The raw token is never persisted.';

create table if not exists fcr_api_usage_events (
  id uuid primary key default gen_random_uuid(),
  token_id uuid not null references fcr_api_tokens(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  route text not null,
  method text not null,
  capability text,
  status_code integer not null check (status_code between 100 and 599),
  connection_count integer not null default 0 check (connection_count >= 0),
  created_at timestamptz not null default now()
);

create index if not exists connection_vault_bindings_project_environment_idx
  on connection_vault_bindings(project_id, environment, status);
create index if not exists fcr_api_tokens_project_environment_idx
  on fcr_api_tokens(project_id, environment, expires_at)
  where revoked_at is null;
create index if not exists fcr_api_usage_events_token_created_idx
  on fcr_api_usage_events(token_id, created_at desc);

alter table connection_vault_bindings enable row level security;
alter table fcr_api_tokens enable row level security;
alter table fcr_api_usage_events enable row level security;

revoke all on connection_vault_bindings from anon, authenticated;
revoke all on fcr_api_tokens from anon, authenticated;
revoke all on fcr_api_usage_events from anon, authenticated;

create trigger connection_vault_bindings_set_updated_at
  before update on connection_vault_bindings
  for each row execute function set_updated_at();

create or replace function audit_connection_vault_binding_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into project_events (
    project_id,
    source_event_id,
    event_type,
    severity,
    screen,
    metadata
  ) values (
    new.project_id,
    gen_random_uuid()::text,
    case when tg_op = 'INSERT' then 'connection_vault_binding_created' else 'connection_vault_binding_updated' end,
    'info',
    'connection-vault-api',
    jsonb_build_object(
      'bindingId', new.id,
      'connectionId', new.connection_id,
      'environment', new.environment,
      'name', new.name,
      'kind', new.kind,
      'storageProvider', new.storage_provider,
      'status', new.status
    )
  );
  return new;
end;
$$;

create trigger connection_vault_bindings_audit
  after insert or update on connection_vault_bindings
  for each row execute function audit_connection_vault_binding_change();

create or replace function audit_fcr_api_token_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  event_name text;
begin
  if tg_op = 'INSERT' then
    event_name := 'fcr_api_token_issued';
  elsif old.revoked_at is null and new.revoked_at is not null then
    event_name := 'fcr_api_token_revoked';
  elsif old.token_hash is distinct from new.token_hash then
    event_name := 'fcr_api_token_rotated';
  else
    return new;
  end if;

  insert into project_events (
    project_id,
    source_event_id,
    event_type,
    severity,
    screen,
    metadata
  ) values (
    new.project_id,
    gen_random_uuid()::text,
    event_name,
    'info',
    'connection-vault-api',
    jsonb_build_object(
      'tokenId', new.id,
      'name', new.name,
      'environment', new.environment,
      'tokenPrefix', new.token_prefix,
      'scopes', new.scopes,
      'expiresAt', new.expires_at
    )
  );
  return new;
end;
$$;

create trigger fcr_api_tokens_audit
  after insert or update on fcr_api_tokens
  for each row execute function audit_fcr_api_token_change();

create or replace function record_fcr_api_token_usage(
  p_token_id uuid,
  p_project_id uuid,
  p_route text,
  p_method text,
  p_capability text,
  p_status_code integer,
  p_connection_count integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update fcr_api_tokens
  set last_used_at = now(), usage_count = usage_count + 1
  where id = p_token_id
    and project_id = p_project_id
    and revoked_at is null
    and expires_at > now();

  if not found then
    raise exception 'FCR API token is unavailable';
  end if;

  insert into fcr_api_usage_events (
    token_id,
    project_id,
    route,
    method,
    capability,
    status_code,
    connection_count
  ) values (
    p_token_id,
    p_project_id,
    left(p_route, 300),
    left(p_method, 16),
    nullif(left(coalesce(p_capability, ''), 160), ''),
    p_status_code,
    greatest(p_connection_count, 0)
  );
end;
$$;

revoke all on function record_fcr_api_token_usage(uuid, uuid, text, text, text, integer, integer) from public, anon, authenticated;
grant execute on function record_fcr_api_token_usage(uuid, uuid, text, text, text, integer, integer) to service_role;
