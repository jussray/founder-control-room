-- Candidate only. Generate a migration with the approved Supabase CLI and
-- prove on an isolated database before wiring the existing founder-only route.
-- Never run this against production from an audit or repair worker.
CREATE OR REPLACE FUNCTION public.reserve_repository_repair_mission(
  p_project_id uuid,
  p_run_id uuid,
  p_finding_ids uuid[],
  p_requested_by_user_id text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_ids uuid[];
  v_run public.repository_verification_runs%ROWTYPE;
  v_latest_run_id uuid;
  v_found_count integer;
  v_assigned_count integer;
  v_mission_ids uuid[];
  v_checks text[];
  v_risk text;
  v_description text;
  v_build_assist jsonb;
  v_builder text;
  v_draft public.missions%ROWTYPE;
  v_mission public.missions%ROWTYPE;
  v_updated integer;
BEGIN
  IF p_project_id IS NULL OR p_run_id IS NULL
    OR p_finding_ids IS NULL OR cardinality(p_finding_ids) NOT BETWEEN 1 AND 100
    OR array_position(p_finding_ids, NULL::uuid) IS NOT NULL
    OR p_requested_by_user_id IS NULL
    OR length(btrim(p_requested_by_user_id)) NOT BETWEEN 1 AND 128 THEN
    RAISE EXCEPTION 'invalid_repair_reservation_input' USING ERRCODE = '22023';
  END IF;

  SELECT array_agg(DISTINCT id ORDER BY id) INTO v_ids
    FROM unnest(p_finding_ids) AS requested(id);
  IF cardinality(v_ids) <> cardinality(p_finding_ids) THEN
    RAISE EXCEPTION 'duplicate_finding_ids' USING ERRCODE = '22023';
  END IF;

  -- Serialize reservations for this project. Findings are locked in stable order.
  PERFORM 1 FROM public.projects WHERE id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'repair_project_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_run FROM public.repository_verification_runs
    WHERE id = p_run_id AND project_id = p_project_id
      AND signature_verified IS TRUE AND overall_status IN ('warning', 'failed');
  IF NOT FOUND OR v_run.commit_sha IS NULL
    OR v_run.commit_sha !~ '^[0-9a-f]{40}$' OR v_run.commit_sha = repeat('0', 40) THEN
    RAISE EXCEPTION 'repair_evidence_not_authoritative' USING ERRCODE = '22023';
  END IF;
  SELECT id INTO v_latest_run_id FROM public.repository_verification_runs
    WHERE project_id = p_project_id
    ORDER BY received_at DESC, id DESC LIMIT 1;
  IF v_latest_run_id IS DISTINCT FROM p_run_id THEN
    RAISE EXCEPTION 'repair_evidence_superseded' USING ERRCODE = '40001';
  END IF;

  PERFORM id FROM public.repository_findings
    WHERE project_id = p_project_id AND id = ANY(v_ids)
    ORDER BY id FOR UPDATE;

  SELECT count(*), count(mission_id),
    array_agg(DISTINCT mission_id) FILTER (WHERE mission_id IS NOT NULL),
    array_agg(fingerprint ORDER BY id),
    CASE WHEN bool_or(severity IN ('critical', 'high')) THEN 'high' ELSE 'medium' END
  INTO v_found_count, v_assigned_count, v_mission_ids, v_checks, v_risk
  FROM public.repository_findings
  WHERE project_id = p_project_id AND id = ANY(v_ids)
    AND status = 'open' AND verification_run_id = p_run_id;

  IF v_found_count <> cardinality(v_ids) THEN
    RAISE EXCEPTION 'repair_findings_stale_or_out_of_scope' USING ERRCODE = '40001';
  END IF;

  -- Retry of the identical scope may return the existing mission, never a new one.
  IF v_assigned_count > 0 THEN
    IF v_assigned_count = cardinality(v_ids) AND cardinality(v_mission_ids) = 1 THEN
      SELECT * INTO v_mission FROM public.missions
        WHERE id = v_mission_ids[1] AND project_id = p_project_id;
      IF FOUND AND v_mission.policy_snapshot->>'source' = 'repository_verification'
        AND v_mission.policy_snapshot->>'source_run_id' = p_run_id::text
        AND v_mission.policy_snapshot->>'source_commit' = v_run.commit_sha
        AND v_mission.policy_snapshot->'finding_ids' = to_jsonb(v_ids) THEN
        RETURN jsonb_build_object('mission_id', v_mission.id, 'created', false,
          'authority', 'proposal_only', 'mutation_authorized', false);
      END IF;
    END IF;
    RAISE EXCEPTION 'repair_findings_already_reserved' USING ERRCODE = '40001';
  END IF;

  -- Restore repository-owned suggestions, never caller-supplied authority.
  SELECT parsed_manifest->'buildAssist' INTO v_build_assist
    FROM public.project_manifests
    WHERE project_id = p_project_id AND superseded_at IS NULL
      AND commit_sha = v_run.commit_sha AND validation_status = 'valid'
    ORDER BY observed_at DESC, id DESC LIMIT 1;
  IF v_build_assist->'enabled' = 'true'::jsonb
    AND jsonb_typeof(v_build_assist->'preferredBuilder') = 'string'
    AND length(btrim(v_build_assist->>'preferredBuilder')) BETWEEN 1 AND 100 THEN
    v_builder := btrim(v_build_assist->>'preferredBuilder');
  END IF;
  -- Preferences can raise risk but never lower the observed severity.
  IF v_build_assist->>'riskLevel' = 'high' THEN v_risk := 'high'; END IF;
  SELECT 'Repository verification repair proposal. No execution authority is granted.'
    || E'\n\n' || string_agg(
      '- ' || left(coalesce(title, 'Untitled finding'), 300)
      || E'\n  Evidence: ' || left(coalesce(detail, 'No detail'), 1000)
      || E'\n  Suggested: ' || left(coalesce(suggested_action, 'Inspect exact evidence'), 1000),
      E'\n' ORDER BY id)
    INTO v_description
    FROM public.repository_findings
    WHERE project_id = p_project_id AND id = ANY(v_ids);

  -- Populate the existing column types rather than guessing enum/array types.
  SELECT * INTO v_draft FROM jsonb_populate_record(NULL::public.missions,
    jsonb_build_object(
      'project_id', p_project_id,
      'title', format('Repair repository verification drift (%s)', cardinality(v_ids)),
      'description', v_description,
      'builder_agent', v_builder,
      'status', 'proposed',
      'base_ref', v_run.branch,
      'risk_level', v_risk,
      'required_checks', to_jsonb(v_checks),
      'policy_snapshot', jsonb_build_object(
        'source', 'repository_verification', 'source_run_id', p_run_id,
        'source_commit', v_run.commit_sha, 'finding_ids', to_jsonb(v_ids),
        'requested_by_user_id', p_requested_by_user_id,
        'authority', 'proposal_only',
        'approvals_required', jsonb_build_array('create_sandbox_workspace',
          'create_branch', 'commit_patch', 'integrate', 'deploy', 'rollback'),
        'mutation_authorized', false,
        'builder_preference_only', true
      )
    ));

  INSERT INTO public.missions (project_id, title, description, status, base_ref,
    risk_level, required_checks, policy_snapshot, builder_agent)
  VALUES (v_draft.project_id, v_draft.title, v_draft.description, v_draft.status,
    v_draft.base_ref, v_draft.risk_level, v_draft.required_checks, v_draft.policy_snapshot, v_draft.builder_agent)
  RETURNING * INTO v_mission;

  UPDATE public.repository_findings SET mission_id = v_mission.id
    WHERE project_id = p_project_id AND id = ANY(v_ids)
      AND mission_id IS NULL AND status = 'open' AND verification_run_id = p_run_id;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> cardinality(v_ids) THEN
    RAISE EXCEPTION 'repair_reservation_conflict' USING ERRCODE = '40001';
  END IF;

  -- The mission, finding assignments and event commit or roll back together.
  INSERT INTO public.project_events (project_id, event_type, severity, decision, metadata)
    VALUES (p_project_id, 'repository_repair_mission_proposed', 'warning',
      'founder_review_required', jsonb_build_object('mission_id', v_mission.id,
        'finding_ids', to_jsonb(v_ids), 'source_commit', v_run.commit_sha,
        'source_run_id', p_run_id, 'requested_by_user_id', p_requested_by_user_id));

  RETURN jsonb_build_object('mission_id', v_mission.id, 'created', true,
    'authority', 'proposal_only', 'mutation_authorized', false);
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_repository_repair_mission(uuid, uuid, uuid[], text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_repository_repair_mission(uuid, uuid, uuid[], text)
  TO service_role;
