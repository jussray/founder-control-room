-- Neon preview postconditions for the unchanged production QuickScan migration.
-- Source SQL executes before these checks. No production provider mutation.
DO $$
DECLARE
  target regclass;
  table_name text;
  role_name text;
  privilege_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['quickscan_prospects', 'quickscan_stripe_events'] LOOP
    target := to_regclass(format('public.%I', table_name));
    IF target IS NULL THEN
      RAISE EXCEPTION 'QuickScan preview table missing: %', table_name;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = target AND relrowsecurity) THEN
      RAISE EXCEPTION 'QuickScan RLS missing on %', table_name;
    END IF;
    FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      FOREACH privilege_name IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'] LOOP
        IF has_table_privilege(role_name, target, privilege_name) THEN
          RAISE EXCEPTION 'QuickScan client role % has unexpected % on %',
            role_name, privilege_name, table_name;
        END IF;
      END LOOP;
    END LOOP;
    FOREACH privilege_name IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE'] LOOP
      IF NOT has_table_privilege('service_role', target, privilege_name) THEN
        RAISE EXCEPTION 'QuickScan service_role missing % on %', privilege_name, table_name;
      END IF;
    END LOOP;
  END LOOP;
  IF NOT has_table_privilege('service_role', 'public.quickscan_prospects', 'DELETE') THEN
    RAISE EXCEPTION 'QuickScan prospects DELETE grant missing';
  END IF;
  IF has_table_privilege('service_role', 'public.quickscan_stripe_events', 'DELETE') THEN
    RAISE EXCEPTION 'QuickScan event ledger unexpectedly DELETE-granted';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.quickscan_prospects'::regclass
                   AND conname = 'quickscan_prospects_id_length')
     OR NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.quickscan_prospects'::regclass
                   AND conname = 'quickscan_prospects_document_object')
     OR NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.quickscan_stripe_events'::regclass
                   AND conname = 'quickscan_stripe_events_id_length') THEN
    RAISE EXCEPTION 'QuickScan required constraints missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes
                 WHERE schemaname = 'public'
                   AND tablename = 'quickscan_prospects'
                   AND indexname = 'quickscan_prospects_updated_at_idx') THEN
    RAISE EXCEPTION 'QuickScan updated-at index missing';
  END IF;
END;
$$;
