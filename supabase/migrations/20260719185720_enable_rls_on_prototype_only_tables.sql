-- Production-applied migration fossil restored from supabase_migrations.schema_migrations.
-- These prototype-only tables are not part of the deployed backend path.

alter table public.lanes enable row level security;
alter table public.ooda_steps enable row level security;
alter table public.events enable row level security;
alter table public.escalations enable row level security;
