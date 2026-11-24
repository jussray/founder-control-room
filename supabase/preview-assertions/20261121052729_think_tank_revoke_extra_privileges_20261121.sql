-- Catalog assertions for the isolated preview; not a live Supabase auth witness.
DO $$
DECLARE
  target regclass := to_regclass('public.think_tank_idea_records');
  expected_role oid := (SELECT oid FROM pg_roles WHERE rolname = 'authenticated');
  permission text;
BEGIN
  IF target IS NULL THEN RAISE EXCEPTION 'Think Tank table missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = target AND relrowsecurity AND relforcerowsecurity) THEN
    RAISE EXCEPTION 'Think Tank forced RLS missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = target AND confrelid = 'auth.users'::regclass AND contype = 'f') THEN
    RAISE EXCEPTION 'Think Tank owner FK missing';
  END IF;
  IF (SELECT count(*) FROM pg_policy WHERE polrelid = target) <> 3 THEN RAISE EXCEPTION 'Unexpected policy count'; END IF;
  IF (SELECT count(*) FROM pg_policy WHERE polrelid = target AND polroles = ARRAY[expected_role] AND polcmd IN ('r','a','w') AND (polqual IS NULL OR (pg_get_expr(polqual,polrelid) LIKE '%auth.uid()%' AND pg_get_expr(polqual,polrelid) LIKE '%is_anonymous%')) AND (polwithcheck IS NULL OR (pg_get_expr(polwithcheck,polrelid) LIKE '%auth.uid()%' AND pg_get_expr(polwithcheck,polrelid) LIKE '%is_anonymous%'))) <> 3 THEN
    RAISE EXCEPTION 'Think Tank owner or anonymous-user policy missing';
  END IF;
  FOREACH permission IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
    IF has_table_privilege('anon', target, permission) THEN RAISE EXCEPTION 'anon has unexpected %', permission; END IF;
    IF has_table_privilege('authenticated', target, permission) <> (permission IN ('SELECT','INSERT','UPDATE')) THEN
      RAISE EXCEPTION 'authenticated privilege mismatch: %', permission;
    END IF;
  END LOOP;
END;
$$;
