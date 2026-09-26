\set ON_ERROR_STOP on

-- CI-only transactional proof contract for
-- 20260926070000_agent_durable_execution_kernel_v11_5.sql.
-- Neon does not ship Supabase's anon/authenticated/service_role roles, so this
-- fixture creates no-login stand-ins only inside this proof transaction. The
-- production migration itself remains strict about Supabase role authority.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'CREATE ROLE anon NOLOGIN';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'CREATE ROLE authenticated NOLOGIN';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'CREATE ROLE service_role NOLOGIN';
  END IF;
END
$$;

\ir ../migrations/20260926070000_agent_durable_execution_kernel_v11_5.sql

DO $$
DECLARE
  admitted_first BOOLEAN;
  first_reason TEXT;
  first_admission UUID;
  first_fence BIGINT;
  first_operation UUID;
  admitted_replay BOOLEAN;
  replay_reason TEXT;
  replay_admission UUID;
  replay_fence BIGINT;
  replay_operation UUID;
  leased_generation BIGINT;
  stale_write BOOLEAN;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_class
    WHERE oid = to_regclass('public.agent_task_authority_state')
      AND relrowsecurity
  ) THEN
    RAISE EXCEPTION 'agent_task_authority_state must have RLS enabled';
  END IF;

  IF has_table_privilege('anon', 'public.agent_execution_outbox', 'SELECT')
     OR has_table_privilege('authenticated', 'public.agent_execution_outbox', 'SELECT')
     OR has_table_privilege('service_role', 'public.agent_execution_outbox', 'SELECT') THEN
    RAISE EXCEPTION 'direct outbox table access must remain closed';
  END IF;

  IF NOT has_function_privilege(
    'service_role',
    'public.admit_agent_execution_v11_5(uuid,uuid,uuid,text,text,text,text,text,text,text,bigint,timestamptz,timestamptz,text,text,text,text,text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'service_role must be able to execute admission function';
  END IF;

  PERFORM public.initialize_agent_task_authority_v11_5('preview-task-v11-5', 9);

  SELECT admitted, reason, admission_id, fencing_token, operation_id
    INTO admitted_first, first_reason, first_admission, first_fence, first_operation
    FROM public.admit_agent_execution_v11_5(
      '11111111-1111-4111-8111-111111111111'::uuid,
      '22222222-2222-4222-8222-222222222222'::uuid,
      '33333333-3333-4333-8333-333333333333'::uuid,
      'permit-preview-1',
      'preview-task-v11-5',
      'agent-preview',
      'http-egress-pep',
      'sha256:' || repeat('a', 64),
      'sha256:' || repeat('b', 64),
      'sha256:' || repeat('c', 64),
      9,
      clock_timestamp() + interval '5 seconds',
      clock_timestamp() + interval '1 day',
      'logical-operation-preview-1',
      'native',
      'HIGH',
      'https://api.example.test',
      'immutable://sha256/preview-envelope-1'
    );

  IF admitted_first IS DISTINCT FROM TRUE OR first_reason <> 'ADMITTED' OR first_fence <> 1 THEN
    RAISE EXCEPTION 'first admission did not win exactly once: admitted=% reason=% fence=%',
      admitted_first, first_reason, first_fence;
  END IF;

  SELECT admitted, reason, admission_id, fencing_token, operation_id
    INTO admitted_replay, replay_reason, replay_admission, replay_fence, replay_operation
    FROM public.admit_agent_execution_v11_5(
      '44444444-4444-4444-8444-444444444444'::uuid,
      '55555555-5555-4555-8555-555555555555'::uuid,
      '66666666-6666-4666-8666-666666666666'::uuid,
      'permit-preview-1',
      'preview-task-v11-5',
      'agent-preview',
      'http-egress-pep',
      'sha256:' || repeat('a', 64),
      'sha256:' || repeat('b', 64),
      'sha256:' || repeat('c', 64),
      9,
      clock_timestamp() + interval '5 seconds',
      clock_timestamp() + interval '1 day',
      'logical-operation-preview-1',
      'native',
      'HIGH',
      'https://api.example.test',
      'immutable://sha256/preview-envelope-1'
    );

  IF admitted_replay IS DISTINCT FROM FALSE OR replay_reason <> 'EXECUTION_PERMIT_ALREADY_CONSUMED' THEN
    RAISE EXCEPTION 'duplicate permit was not rejected: admitted=% reason=%', admitted_replay, replay_reason;
  END IF;

  SELECT lease_generation
    INTO leased_generation
    FROM public.lease_agent_execution_outbox_v11_5('preview-worker-a', 30)
    WHERE operation_id = first_operation;

  IF leased_generation <> 1 THEN
    RAISE EXCEPTION 'first lease generation must be 1, got %', leased_generation;
  END IF;

  stale_write := public.record_agent_execution_outcome_v11_5(
    '77777777-7777-4777-8777-777777777777'::uuid,
    first_operation,
    'preview-worker-a',
    leased_generation + 1,
    'SUCCEEDED',
    'provider-preview-1'
  );

  IF stale_write IS DISTINCT FROM FALSE THEN
    RAISE EXCEPTION 'stale lease generation unexpectedly wrote an outcome';
  END IF;
END
$$;

ROLLBACK;
