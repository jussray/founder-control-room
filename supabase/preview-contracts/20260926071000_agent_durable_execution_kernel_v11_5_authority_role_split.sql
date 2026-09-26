\set ON_ERROR_STOP on

-- CI-only proof for the append-only authority-role hardening successor.
-- The reused Neon preview already receipts the bootstrap migration checksum,
-- while its bootstrap preview contract rolled schema state back. Reconstruct the
-- ordered pair inside one proof transaction, verify final privileges + kernel
-- semantics, then roll everything back.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN EXECUTE 'CREATE ROLE anon NOLOGIN'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN EXECUTE 'CREATE ROLE authenticated NOLOGIN'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN EXECUTE 'CREATE ROLE service_role NOLOGIN'; END IF;
END
$$;

\ir ../migrations/20260926070000_agent_durable_execution_kernel_v11_5.sql
\ir ../migrations/20260926071000_agent_durable_execution_kernel_v11_5_authority_role_split.sql

DO $$
DECLARE
  first_admitted boolean;
  first_reason text;
  first_admission uuid;
  first_fence bigint;
  first_operation uuid;
  replay_admitted boolean;
  replay_reason text;
  replay_admission uuid;
  replay_fence bigint;
  replay_operation uuid;
  leased_generation bigint;
  stale_write boolean;
BEGIN
  IF has_table_privilege('service_role', 'public.agent_task_authority_state', 'SELECT')
     OR has_table_privilege('service_role', 'public.agent_execution_admissions', 'SELECT')
     OR has_table_privilege('service_role', 'public.agent_execution_receipts', 'SELECT')
     OR has_table_privilege('service_role', 'public.agent_execution_outbox', 'SELECT') THEN
    RAISE EXCEPTION 'generic service_role must not hold direct kernel table access';
  END IF;

  IF has_function_privilege('service_role', 'public.initialize_agent_task_authority_v11_5(text,bigint)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.transition_agent_task_authority_v11_5(text,bigint,text)', 'EXECUTE')
     OR has_function_privilege(
       'service_role',
       'public.admit_agent_execution_v11_5(uuid,uuid,uuid,text,text,text,text,text,text,text,bigint,timestamptz,timestamptz,text,text,text,text,text)',
       'EXECUTE'
     )
     OR has_function_privilege('service_role', 'public.lease_agent_execution_outbox_v11_5(text,integer)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.record_agent_execution_outcome_v11_5(uuid,uuid,text,bigint,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'generic service_role must not hold v11.5 kernel function authority';
  END IF;

  -- The migration owner exercises the source-only proof. Runtime role grants
  -- remain absent until a separate activation migration is authorized.
  PERFORM public.initialize_agent_task_authority_v11_5('preview-task-v11-5-hardening', 11);

  SELECT admitted, reason, admission_id, fencing_token, operation_id
    INTO first_admitted, first_reason, first_admission, first_fence, first_operation
    FROM public.admit_agent_execution_v11_5(
      '11111111-1111-4111-8111-111111111112'::uuid,
      '22222222-2222-4222-8222-222222222223'::uuid,
      '33333333-3333-4333-8333-333333333334'::uuid,
      'permit-preview-hardening-1',
      'preview-task-v11-5-hardening',
      'agent-preview',
      'http-egress-pep',
      'sha256:' || repeat('a', 64),
      'sha256:' || repeat('b', 64),
      'sha256:' || repeat('c', 64),
      11,
      clock_timestamp() + interval '5 seconds',
      clock_timestamp() + interval '1 day',
      'logical-operation-preview-hardening-1',
      'native',
      'HIGH',
      'https://api.example.test',
      'immutable://sha256/preview-envelope-hardening-1'
    );

  IF first_admitted IS DISTINCT FROM TRUE OR first_reason <> 'ADMITTED' OR first_fence <> 1 THEN
    RAISE EXCEPTION 'first hardened admission failed: admitted=% reason=% fence=%', first_admitted, first_reason, first_fence;
  END IF;

  SELECT admitted, reason, admission_id, fencing_token, operation_id
    INTO replay_admitted, replay_reason, replay_admission, replay_fence, replay_operation
    FROM public.admit_agent_execution_v11_5(
      '44444444-4444-4444-8444-444444444445'::uuid,
      '55555555-5555-4555-8555-555555555556'::uuid,
      '66666666-6666-4666-8666-666666666667'::uuid,
      'permit-preview-hardening-1',
      'preview-task-v11-5-hardening',
      'agent-preview',
      'http-egress-pep',
      'sha256:' || repeat('a', 64),
      'sha256:' || repeat('b', 64),
      'sha256:' || repeat('c', 64),
      11,
      clock_timestamp() + interval '5 seconds',
      clock_timestamp() + interval '1 day',
      'logical-operation-preview-hardening-1',
      'native',
      'HIGH',
      'https://api.example.test',
      'immutable://sha256/preview-envelope-hardening-1'
    );

  IF replay_admitted IS DISTINCT FROM FALSE OR replay_reason <> 'EXECUTION_PERMIT_ALREADY_CONSUMED' THEN
    RAISE EXCEPTION 'duplicate hardened permit was not rejected: admitted=% reason=%', replay_admitted, replay_reason;
  END IF;

  SELECT lease_generation
    INTO leased_generation
    FROM public.lease_agent_execution_outbox_v11_5('preview-worker-hardening-a', 30)
    WHERE operation_id = first_operation;

  IF leased_generation <> 1 THEN
    RAISE EXCEPTION 'first hardened lease generation must be 1, got %', leased_generation;
  END IF;

  stale_write := public.record_agent_execution_outcome_v11_5(
    '77777777-7777-4777-8777-777777777778'::uuid,
    first_operation,
    'preview-worker-hardening-a',
    leased_generation + 1,
    'SUCCEEDED',
    'provider-preview-hardening-1'
  );

  IF stale_write IS DISTINCT FROM FALSE THEN
    RAISE EXCEPTION 'stale hardened lease generation unexpectedly wrote an outcome';
  END IF;
END
$$;

ROLLBACK;
