-- Neon-only readback. Verifies the REAL migration SQL executed against
-- the isolated Supabase-compatibility fixture; not a live Supabase proof.
DO $$
DECLARE
  target regclass := to_regclass('public.fcr_member_browser_sessions');
  role_name text;
  permission text;
BEGIN
  IF target IS NULL THEN
    RAISE EXCEPTION 'member sessions table missing in preview';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = target AND relrowsecurity) THEN
    RAISE EXCEPTION 'member session RLS missing in preview';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = target AND confrelid = 'auth.users'::regclass AND contype = 'f'
  ) THEN
    RAISE EXCEPTION 'auth.users FK missing in preview';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = target AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%[0-9a-f]{64}%'
  ) THEN
    RAISE EXCEPTION 'session token hash constraint missing in preview';
  END IF;
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    FOREACH permission IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE'] LOOP
      IF has_table_privilege(role_name, target, permission) THEN
        RAISE EXCEPTION 'client role % has unexpected % access to member sessions', role_name, permission;
      END IF;
    END LOOP;
  END LOOP;
  FOREACH permission IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE'] LOOP
    IF NOT has_table_privilege('service_role', target, permission) THEN
      RAISE EXCEPTION 'service_role missing % permission on member sessions', permission;
    END IF;
  END LOOP;
END;
$$;
