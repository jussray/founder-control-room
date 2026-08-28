-- Production-applied migration fossil restored from supabase_migrations.schema_migrations.

create extension if not exists pg_cron schema extensions;
grant usage on schema cron to postgres;

select cron.schedule(
  'advance-to-steady-state',
  '0 2 * * *',
  $$
    update public.user_onboarding_state
    set stage = 'steady_state', updated_at = now()
    where stage = 'activated'
      and activated_at <= now() - interval '7 days'
      and activated_at is not null;
  $$
);

alter table public.user_onboarding_state
  add column if not exists is_stuck boolean not null default false;

select cron.schedule(
  'flag-stuck-users',
  '30 2 * * *',
  $$
    update public.user_onboarding_state
    set is_stuck = true, updated_at = now()
    where stage not in ('activated','steady_state')
      and created_at < now() - interval '72 hours'
      and is_stuck = false;
  $$
);
