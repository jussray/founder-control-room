DO $$
DECLARE current_expression text;
BEGIN
  SELECT qual INTO current_expression
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'reconciliation_events'
    AND policyname = 'auth_read'
    AND cmd = 'SELECT'
    AND roles = ARRAY['authenticated']::name[];

  IF current_expression IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'Expected exact auth_read policy using true, received %; no change applied', current_expression;
  END IF;

  EXECUTE 'ALTER POLICY auth_read ON public.reconciliation_events USING (false)';
END $$;
