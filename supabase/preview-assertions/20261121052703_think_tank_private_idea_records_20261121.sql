-- Neon-only structural readback; never proof of live Supabase authentication.
DO $$
DECLARE
  target regclass := to_regclass('public.think_tank_idea_records');
  permission text;
  policy_count integer;
BEGIN
  IF target IS NULL THEN RAISE EXCEPTION 'Think Tank preview table missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = target AND relrowsecurity AND relforcerowsecurity) THEN
    RAISE EXCEPTION 'Think Tank forced RLS missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = target AND confrelid = 'auth.users'::regclass AND contype = 'f') THEN
    RAISE EXCEPTION 'Think Tank owner foreign key missing';
  END IF;
  FOREACH permission IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
    IF has_table_privilege('anon', target, permission) THEN
      RAISE EXCEPTION 'Anonymous vault privilege: %', permission;
    END IF;
  END LOOP;
  FOREACH permission IN ARRAY ARRAY['SELECT','INSERT','UPDATE'] LOOP
    IF NOT has_table_privilege('authenticated', target, permission) THEN
      RAISE EXCEPTION 'Missing authenticated vault privilege: %', permission;
    END IF;
  END LOOP;
  SELECT count(*) INTO policy_count FROM pg_policy WHERE polrelid = target;
  IF policy_count <> 3 OR EXISTS (
    SELECT 1 FROM pg_policy WHERE polrelid = target AND (
      polcmd NOT IN ('r','a','w') OR
      polroles <> ARRAY[(SELECT oid FROM pg_roles WHERE rolname = 'authenticated')]::oid[] OR
      (polcmd IN ('r','w') AND (coalesce(pg_get_expr(polqual, polrelid),'') NOT LIKE '%auth.uid()%owner_user_id%' OR coalesce(pg_get_expr(polqual, polrelid),'') NOT LIKE '%is_anonymous%')) OR
      (polcmd IN ('a','w') AND (coalesce(pg_get_expr(polwithcheck, polrelid),'') NOT LIKE '%auth.uid()%owner_user_id%' OR coalesce(pg_get_expr(polwithcheck, polrelid),'') NOT LIKE '%is_anonymous%'))
    )
  ) THEN RAISE EXCEPTION 'Unexpected Think Tank owner policy contract'; END IF;
END;
$$;
