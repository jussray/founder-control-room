-- Atomic manual preview evidence import.
--
-- A preview packet is founder-reviewed temporary evidence. It is always stored
-- unsigned, never creates a mission, and never grants repository/deployment
-- authority. All writes happen inside one PostgreSQL function call so a later
-- validation or persistence failure rolls the entire import back.

create or replace function public.import_repository_preview_evidence(
  p_packet jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_project public.projects%rowtype;
  v_project_id uuid;
  v_project_slug text;
  v_provider text;
  v_identifier text;
  v_branch text;
  v_commit_sha text;
  v_manifest_kind text;
  v_manifest_value text;
  v_manifest_path text;
  v_manifest_hash text;
  v_generated_at timestamptz;
  v_overall_status text;
  v_evidence text;
  v_delivery_id text;
  v_run_id uuid;
  v_now timestamptz := now();
  v_build_assist jsonb;
  v_check jsonb;
  v_capability jsonb;
  v_finding jsonb;
  v_fingerprint jsonb;
  v_usage_ids text[];
  v_failed_usage_ids text[];
  v_active_fingerprints text[] := array[]::text[];
  v_resolved_count integer := 0;
  v_finding_count integer := 0;
begin
  if p_packet is null or jsonb_typeof(p_packet) <> 'object' then
    raise exception 'preview_packet_root_invalid' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(p_packet) as key
    where key not in (
      'schemaVersion', 'projectId', 'repository', 'branch', 'commitSha',
      'manifest', 'generatedAt', 'overallStatus', 'evidence', 'buildAssist',
      'checks', 'capabilities', 'findings', 'resolvedFindingFingerprints'
    )
  ) then
    raise exception 'preview_packet_unknown_top_level_field' using errcode = '22023';
  end if;

  if p_packet->>'schemaVersion' <> '1.0' then
    raise exception 'preview_packet_schema_unsupported' using errcode = '22023';
  end if;

  if jsonb_typeof(p_packet->'repository') <> 'object' then
    raise exception 'preview_repository_invalid' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_object_keys(p_packet->'repository') as key
    where key not in ('provider', 'identifier')
  ) then
    raise exception 'preview_repository_unknown_field' using errcode = '22023';
  end if;

  if jsonb_typeof(p_packet->'manifest') <> 'object' then
    raise exception 'preview_manifest_invalid' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_object_keys(p_packet->'manifest') as key
    where key not in ('kind', 'value', 'path')
  ) then
    raise exception 'preview_manifest_unknown_field' using errcode = '22023';
  end if;

  v_project_slug := btrim(p_packet->>'projectId');
  v_provider := btrim(p_packet->'repository'->>'provider');
  v_identifier := btrim(p_packet->'repository'->>'identifier');
  v_branch := btrim(p_packet->>'branch');
  v_commit_sha := lower(btrim(p_packet->>'commitSha'));
  v_manifest_kind := btrim(p_packet->'manifest'->>'kind');
  v_manifest_value := lower(btrim(p_packet->'manifest'->>'value'));
  v_manifest_path := coalesce(
    nullif(btrim(p_packet->'manifest'->>'path'), ''),
    '.control-room/repository.manifest.json'
  );
  v_overall_status := btrim(p_packet->>'overallStatus');
  v_evidence := btrim(p_packet->>'evidence');

  if coalesce(v_project_slug, '') = ''
     or coalesce(v_provider, '') = ''
     or coalesce(v_identifier, '') = ''
     or coalesce(v_branch, '') = ''
     or coalesce(v_evidence, '') = '' then
    raise exception 'preview_packet_required_text_missing' using errcode = '22023';
  end if;

  if length(v_project_slug) > 100
     or length(v_provider) > 50
     or length(v_identifier) > 300
     or length(v_branch) > 200
     or length(v_evidence) > 1000 then
    raise exception 'preview_packet_text_too_long' using errcode = '22023';
  end if;

  if v_commit_sha !~ '^[a-f0-9]{7,64}$' then
    raise exception 'preview_commit_sha_invalid' using errcode = '22023';
  end if;

  if v_manifest_kind = 'github_blob_sha' then
    if v_manifest_value !~ '^[a-f0-9]{40}$' then
      raise exception 'preview_manifest_blob_sha_invalid' using errcode = '22023';
    end if;
  elsif v_manifest_kind = 'sha256' then
    if v_manifest_value !~ '^[a-f0-9]{64}$' then
      raise exception 'preview_manifest_sha256_invalid' using errcode = '22023';
    end if;
  else
    raise exception 'preview_manifest_kind_invalid' using errcode = '22023';
  end if;

  if v_manifest_path like '/%'
     or position('\\' in v_manifest_path) > 0
     or exists (
       select 1
       from unnest(string_to_array(v_manifest_path, '/')) as segment
       where segment = '..'
     ) then
    raise exception 'preview_manifest_path_unsafe' using errcode = '22023';
  end if;

  if v_overall_status not in ('passed', 'warning', 'failed') then
    raise exception 'preview_overall_status_invalid' using errcode = '22023';
  end if;

  begin
    v_generated_at := (p_packet->>'generatedAt')::timestamptz;
  exception when others then
    raise exception 'preview_generated_at_invalid' using errcode = '22023';
  end;

  select *
  into v_project
  from public.projects
  where slug = v_project_slug
  limit 1;

  if not found then
    raise exception 'preview_project_not_registered' using errcode = 'P0002';
  end if;
  v_project_id := v_project.id;

  if v_project.repo_provider <> v_provider
     or v_project.repo_identifier <> v_identifier then
    raise exception 'preview_repository_identity_mismatch' using errcode = '42501';
  end if;

  if jsonb_typeof(coalesce(p_packet->'checks', '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_packet->'checks', '[]'::jsonb)) > 200 then
    raise exception 'preview_checks_invalid' using errcode = '22023';
  end if;

  for v_check in
    select value from jsonb_array_elements(coalesce(p_packet->'checks', '[]'::jsonb))
  loop
    if jsonb_typeof(v_check) <> 'object' then
      raise exception 'preview_check_not_object' using errcode = '22023';
    end if;
    if exists (
      select 1 from jsonb_object_keys(v_check) as key
      where key not in ('id', 'name', 'required', 'status', 'reason')
    ) then
      raise exception 'preview_check_unknown_field' using errcode = '22023';
    end if;
    if coalesce(btrim(v_check->>'id'), '') = ''
       or length(v_check->>'id') > 100
       or coalesce(btrim(v_check->>'name'), '') = ''
       or length(v_check->>'name') > 200
       or v_check->>'status' not in (
         'passed', 'failed', 'skipped', 'pending', 'cancelled'
       ) then
      raise exception 'preview_check_invalid' using errcode = '22023';
    end if;
    if v_check ? 'required'
       and jsonb_typeof(v_check->'required') <> 'boolean' then
      raise exception 'preview_check_required_invalid' using errcode = '22023';
    end if;
    if v_check ? 'reason' and length(v_check->>'reason') > 500 then
      raise exception 'preview_check_reason_too_long' using errcode = '22023';
    end if;
  end loop;

  if jsonb_typeof(coalesce(p_packet->'capabilities', '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_packet->'capabilities', '[]'::jsonb)) > 200 then
    raise exception 'preview_capabilities_invalid' using errcode = '22023';
  end if;

  for v_capability in
    select value
    from jsonb_array_elements(coalesce(p_packet->'capabilities', '[]'::jsonb))
  loop
    if jsonb_typeof(v_capability) <> 'object' then
      raise exception 'preview_capability_not_object' using errcode = '22023';
    end if;
    if exists (
      select 1 from jsonb_object_keys(v_capability) as key
      where key not in (
        'id', 'claimedStatus', 'observedStatus', 'evidencePaths',
        'missingEvidencePaths', 'requiredSignalIds', 'failedSignalIds',
        'usageAssertionIds', 'failedUsageAssertionIds', 'reason'
      )
    ) then
      raise exception 'preview_capability_unknown_field' using errcode = '22023';
    end if;
    if coalesce(btrim(v_capability->>'id'), '') = ''
       or length(v_capability->>'id') > 100
       or v_capability->>'claimedStatus' not in ('active', 'planned', 'retired')
       or v_capability->>'observedStatus' not in (
         'verified', 'drifted', 'unverified', 'retired'
       ) then
      raise exception 'preview_capability_invalid' using errcode = '22023';
    end if;

    if exists (
      select 1
      from jsonb_object_keys(v_capability) as key
      where key in (
        'usageMarker', 'usageMarkers', 'marker', 'source', 'sourceCode',
        'sourceContent', 'fileContent', 'rawLog', 'secret'
      )
    ) then
      raise exception 'preview_capability_forbidden_content_field' using errcode = '22023';
    end if;

    if jsonb_typeof(coalesce(v_capability->'evidencePaths', '[]'::jsonb)) <> 'array'
       or jsonb_typeof(coalesce(v_capability->'missingEvidencePaths', '[]'::jsonb)) <> 'array'
       or jsonb_typeof(coalesce(v_capability->'requiredSignalIds', '[]'::jsonb)) <> 'array'
       or jsonb_typeof(coalesce(v_capability->'failedSignalIds', '[]'::jsonb)) <> 'array'
       or jsonb_typeof(coalesce(v_capability->'usageAssertionIds', '[]'::jsonb)) <> 'array'
       or jsonb_typeof(coalesce(v_capability->'failedUsageAssertionIds', '[]'::jsonb)) <> 'array' then
      raise exception 'preview_capability_arrays_invalid' using errcode = '22023';
    end if;

    if exists (
      select 1
      from jsonb_array_elements_text(
        coalesce(v_capability->'evidencePaths', '[]'::jsonb)
      ) as path(value)
      where value like '/%'
         or position('\\' in value) > 0
         or exists (
           select 1
           from unnest(string_to_array(value, '/')) as segment
           where segment = '..'
         )
    ) or exists (
      select 1
      from jsonb_array_elements_text(
        coalesce(v_capability->'missingEvidencePaths', '[]'::jsonb)
      ) as path(value)
      where value like '/%'
         or position('\\' in value) > 0
         or exists (
           select 1
           from unnest(string_to_array(value, '/')) as segment
           where segment = '..'
         )
    ) then
      raise exception 'preview_capability_path_unsafe' using errcode = '22023';
    end if;

    select coalesce(array_agg(value), array[]::text[])
    into v_usage_ids
    from jsonb_array_elements_text(
      coalesce(v_capability->'usageAssertionIds', '[]'::jsonb)
    );

    select coalesce(array_agg(value), array[]::text[])
    into v_failed_usage_ids
    from jsonb_array_elements_text(
      coalesce(v_capability->'failedUsageAssertionIds', '[]'::jsonb)
    );

    if not (v_failed_usage_ids <@ v_usage_ids) then
      raise exception 'preview_failed_usage_not_subset' using errcode = '22023';
    end if;

    if v_capability ? 'reason' and length(v_capability->>'reason') > 1000 then
      raise exception 'preview_capability_reason_too_long' using errcode = '22023';
    end if;
  end loop;

  if jsonb_typeof(coalesce(p_packet->'findings', '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_packet->'findings', '[]'::jsonb)) > 200 then
    raise exception 'preview_findings_invalid' using errcode = '22023';
  end if;

  for v_finding in
    select value from jsonb_array_elements(coalesce(p_packet->'findings', '[]'::jsonb))
  loop
    if jsonb_typeof(v_finding) <> 'object' then
      raise exception 'preview_finding_not_object' using errcode = '22023';
    end if;
    if exists (
      select 1 from jsonb_object_keys(v_finding) as key
      where key not in (
        'fingerprint', 'category', 'severity', 'title', 'detail',
        'suggestedAction'
      )
    ) then
      raise exception 'preview_finding_unknown_field' using errcode = '22023';
    end if;
    if coalesce(btrim(v_finding->>'fingerprint'), '') = ''
       or length(v_finding->>'fingerprint') > 200
       or v_finding->>'category' not in (
         'manifest', 'check', 'capability', 'runtime', 'provider'
       )
       or v_finding->>'severity' not in ('low', 'medium', 'high', 'critical')
       or coalesce(btrim(v_finding->>'title'), '') = ''
       or length(v_finding->>'title') > 300
       or length(coalesce(v_finding->>'detail', '')) > 2000
       or length(coalesce(v_finding->>'suggestedAction', '')) > 2000 then
      raise exception 'preview_finding_invalid' using errcode = '22023';
    end if;
    v_active_fingerprints := array_append(
      v_active_fingerprints,
      v_finding->>'fingerprint'
    );
  end loop;

  if cardinality(v_active_fingerprints) <> cardinality(
    array(select distinct value from unnest(v_active_fingerprints) as value)
  ) then
    raise exception 'preview_finding_fingerprint_duplicate' using errcode = '22023';
  end if;

  if jsonb_typeof(
    coalesce(p_packet->'resolvedFindingFingerprints', '[]'::jsonb)
  ) <> 'array' then
    raise exception 'preview_resolved_findings_invalid' using errcode = '22023';
  end if;

  for v_fingerprint in
    select value
    from jsonb_array_elements(
      coalesce(p_packet->'resolvedFindingFingerprints', '[]'::jsonb)
    )
  loop
    if jsonb_typeof(v_fingerprint) <> 'string'
       or length(trim(both '"' from v_fingerprint::text)) > 200 then
      raise exception 'preview_resolved_fingerprint_invalid' using errcode = '22023';
    end if;
    if trim(both '"' from v_fingerprint::text) = any(v_active_fingerprints) then
      raise exception 'preview_finding_active_and_resolved' using errcode = '22023';
    end if;
  end loop;

  v_build_assist := coalesce(p_packet->'buildAssist', '{"enabled":false}'::jsonb);
  if jsonb_typeof(v_build_assist) <> 'object'
     or exists (
       select 1 from jsonb_object_keys(v_build_assist) as key
       where key not in ('enabled', 'preferredBuilder', 'riskLevel')
     )
     or jsonb_typeof(coalesce(v_build_assist->'enabled', 'false'::jsonb)) <> 'boolean'
     or coalesce(v_build_assist->>'riskLevel', 'medium') not in (
       'low', 'medium', 'high'
     ) then
    raise exception 'preview_build_assist_invalid' using errcode = '22023';
  end if;

  v_manifest_hash := v_manifest_kind || ':' || v_manifest_value;
  v_delivery_id := 'manual-preview-' || v_project_slug || '-'
    || substr(v_commit_sha, 1, 12);

  -- From this point forward every operation is part of this one function call.
  -- Any raised exception rolls every write below back.
  update public.project_manifests
  set superseded_at = v_generated_at
  where project_id = v_project_id
    and superseded_at is null;

  insert into public.project_manifests (
    project_id,
    repository_provider,
    repository_identifier,
    path,
    commit_sha,
    content_hash,
    schema_version,
    parsed_manifest,
    validation_status,
    validation_errors,
    default_branch,
    imported_at,
    observed_at,
    superseded_at
  ) values (
    v_project_id,
    v_provider,
    v_identifier,
    v_manifest_path,
    v_commit_sha,
    v_manifest_hash,
    '1.0',
    jsonb_build_object(
      'schemaVersion', '1.0',
      'projectId', v_project_slug,
      'buildAssist', v_build_assist,
      'manualPreview', true
    ),
    'valid',
    '[]'::jsonb,
    'main',
    v_generated_at,
    v_generated_at,
    null
  )
  on conflict (project_id, commit_sha, content_hash) do update
  set repository_provider = excluded.repository_provider,
      repository_identifier = excluded.repository_identifier,
      path = excluded.path,
      parsed_manifest = excluded.parsed_manifest,
      validation_status = excluded.validation_status,
      validation_errors = excluded.validation_errors,
      default_branch = excluded.default_branch,
      imported_at = excluded.imported_at,
      observed_at = excluded.observed_at,
      superseded_at = null;

  insert into public.repository_verification_runs (
    project_id,
    source,
    delivery_id,
    repository_provider,
    repository_identifier,
    branch,
    commit_sha,
    manifest_hash,
    overall_status,
    checks,
    capabilities,
    runner,
    signature_verified,
    scanned_at,
    received_at
  ) values (
    v_project_id,
    'runner',
    v_delivery_id,
    v_provider,
    v_identifier,
    v_branch,
    v_commit_sha,
    v_manifest_hash,
    v_overall_status,
    coalesce(p_packet->'checks', '[]'::jsonb),
    coalesce(p_packet->'capabilities', '[]'::jsonb),
    jsonb_build_object(
      'provider', 'founder_manual_audit',
      'mode', 'preview_branch_import',
      'evidence', v_evidence,
      'manifestHashKind', v_manifest_kind
    ),
    false,
    v_generated_at,
    v_now
  )
  on conflict (project_id, source, delivery_id) do update
  set repository_provider = excluded.repository_provider,
      repository_identifier = excluded.repository_identifier,
      branch = excluded.branch,
      commit_sha = excluded.commit_sha,
      manifest_hash = excluded.manifest_hash,
      overall_status = excluded.overall_status,
      checks = excluded.checks,
      capabilities = excluded.capabilities,
      runner = excluded.runner,
      signature_verified = false,
      scanned_at = excluded.scanned_at,
      received_at = excluded.received_at
  returning id into v_run_id;

  for v_capability in
    select value
    from jsonb_array_elements(coalesce(p_packet->'capabilities', '[]'::jsonb))
  loop
    insert into public.repository_capability_evidence (
      project_id,
      capability_id,
      claimed_status,
      observed_status,
      evidence_paths,
      missing_evidence_paths,
      required_signal_ids,
      failed_signal_ids,
      usage_assertion_ids,
      failed_usage_assertion_ids,
      reason,
      commit_sha,
      last_verified_at,
      updated_at
    ) values (
      v_project_id,
      v_capability->>'id',
      v_capability->>'claimedStatus',
      v_capability->>'observedStatus',
      array(
        select value from jsonb_array_elements_text(
          coalesce(v_capability->'evidencePaths', '[]'::jsonb)
        )
      ),
      array(
        select value from jsonb_array_elements_text(
          coalesce(v_capability->'missingEvidencePaths', '[]'::jsonb)
        )
      ),
      array(
        select value from jsonb_array_elements_text(
          coalesce(v_capability->'requiredSignalIds', '[]'::jsonb)
        )
      ),
      array(
        select value from jsonb_array_elements_text(
          coalesce(v_capability->'failedSignalIds', '[]'::jsonb)
        )
      ),
      array(
        select value from jsonb_array_elements_text(
          coalesce(v_capability->'usageAssertionIds', '[]'::jsonb)
        )
      ),
      array(
        select value from jsonb_array_elements_text(
          coalesce(v_capability->'failedUsageAssertionIds', '[]'::jsonb)
        )
      ),
      nullif(v_capability->>'reason', ''),
      v_commit_sha,
      v_generated_at,
      v_now
    )
    on conflict (project_id, capability_id) do update
    set claimed_status = excluded.claimed_status,
        observed_status = excluded.observed_status,
        evidence_paths = excluded.evidence_paths,
        missing_evidence_paths = excluded.missing_evidence_paths,
        required_signal_ids = excluded.required_signal_ids,
        failed_signal_ids = excluded.failed_signal_ids,
        usage_assertion_ids = excluded.usage_assertion_ids,
        failed_usage_assertion_ids = excluded.failed_usage_assertion_ids,
        reason = excluded.reason,
        commit_sha = excluded.commit_sha,
        last_verified_at = excluded.last_verified_at,
        updated_at = excluded.updated_at;
  end loop;

  for v_finding in
    select value from jsonb_array_elements(coalesce(p_packet->'findings', '[]'::jsonb))
  loop
    insert into public.repository_findings (
      project_id,
      verification_run_id,
      fingerprint,
      category,
      severity,
      status,
      title,
      detail,
      suggested_action,
      first_seen_at,
      last_seen_at,
      resolved_at
    ) values (
      v_project_id,
      v_run_id,
      v_finding->>'fingerprint',
      v_finding->>'category',
      v_finding->>'severity',
      'open',
      v_finding->>'title',
      nullif(v_finding->>'detail', ''),
      nullif(v_finding->>'suggestedAction', ''),
      v_now,
      v_now,
      null
    )
    on conflict (project_id, fingerprint) do update
    set verification_run_id = excluded.verification_run_id,
        category = excluded.category,
        severity = excluded.severity,
        status = 'open',
        title = excluded.title,
        detail = excluded.detail,
        suggested_action = excluded.suggested_action,
        last_seen_at = excluded.last_seen_at,
        resolved_at = null;
    v_finding_count := v_finding_count + 1;
  end loop;

  for v_fingerprint in
    select value
    from jsonb_array_elements(
      coalesce(p_packet->'resolvedFindingFingerprints', '[]'::jsonb)
    )
  loop
    update public.repository_findings
    set status = 'resolved',
        resolved_at = v_now,
        last_seen_at = v_now
    where project_id = v_project_id
      and fingerprint = trim(both '"' from v_fingerprint::text)
      and status = 'open';
    v_resolved_count := v_resolved_count + case when found then 1 else 0 end;
  end loop;

  insert into public.project_events (
    project_id,
    source_event_id,
    event_type,
    severity,
    provider,
    decision,
    metadata
  ) values (
    v_project_id,
    'manual-preview:' || v_project_slug || ':' || substr(v_commit_sha, 1, 12),
    'repository_preview_verification_' || v_overall_status,
    case when v_overall_status = 'passed' then 'info' else 'warning' end,
    v_provider,
    case
      when v_overall_status = 'passed' then 'preview_verified'
      else 'founder_attention_required'
    end,
    jsonb_build_object(
      'source', 'manual_preview_import',
      'branch', v_branch,
      'commit_sha', v_commit_sha,
      'manifest_hash', v_manifest_hash,
      'signature_verified', false,
      'superseded_by_future_default_branch_scan', true
    )
  )
  on conflict do nothing;

  return jsonb_build_object(
    'imported', true,
    'project', v_project_slug,
    'branch', v_branch,
    'commitSha', v_commit_sha,
    'overallStatus', v_overall_status,
    'evidenceKind', 'manual_preview',
    'signatureVerified', false,
    'runId', v_run_id,
    'findingsOpenedOrUpdated', v_finding_count,
    'findingsExplicitlyResolved', v_resolved_count,
    'missionsCreated', 0
  );
end;
$$;

revoke all on function public.import_repository_preview_evidence(jsonb) from public;
revoke all on function public.import_repository_preview_evidence(jsonb) from anon;
revoke all on function public.import_repository_preview_evidence(jsonb) from authenticated;
grant execute on function public.import_repository_preview_evidence(jsonb) to service_role;

comment on function public.import_repository_preview_evidence(jsonb) is
  'Service-role-only atomic import of sanitized unsigned manual preview evidence. Creates no mission and grants no repository/deployment authority.';
