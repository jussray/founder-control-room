begin;

alter function public.ingest_founder_content_metric_observations(text, uuid, jsonb, timestamptz)
  set search_path = pg_catalog;

alter function public.ingest_founder_content_metrics_from_lifecycle_event()
  set search_path = pg_catalog;

alter function public.import_founder_content_metric_observations(text, uuid, jsonb, text, timestamptz)
  set search_path = pg_catalog;

commit;
