-- pg_cron: purge stale trusted_devices daily at 3am UTC
-- Backs docs/compliance/DEVICE_MANAGEMENT.md section 4
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'purge-stale-trusted-devices',
  '0 3 * * *',
  $$ SELECT public.purge_stale_devices(); $$
);
