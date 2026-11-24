-- Verify final SQL grants after the actual additive privilege correction.
-- Neon preview only; this does not prove production Supabase state.
DO $$
DECLARE
  target regclass := to_regclass('public.think_tank_idea_records');
  permission text;
BEGIN
  IF target IS NULL THEN RAISE EXCEPTION 'Think Tank preview table missing'; END IF;
  FOREACH permission IN ARRAY ARRAY['DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
    IF has_table_privilege('authenticated', target, permission) THEN
      RAISE EXCEPTION 'Unexpected authenticated vault privilege: %', permission;
    END IF;
  END LOOP;
  FOREACH permission IN ARRAY ARRAY['SELECT','INSERT','UPDATE'] LOOP
    IF NOT has_table_privilege('authenticated', target, permission) THEN
      RAISE EXCEPTION 'Missing authenticated vault privilege: %', permission;
    END IF;
  END LOOP;
END;
$$;
