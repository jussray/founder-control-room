-- =============================================================================
-- Backfill approved FCR merge intents
--
-- The transition trigger in 20260819093000 protects future approvals. This
-- migration closes the historical liveness seam: after it commits, there may
-- not already be an approved Founder Control Room mission that exists only in
-- missions/proof memory without an enumerable merge_intents row.
-- =============================================================================

begin;

-- Fail closed instead of silently skipping an already-approved FCR mission
-- whose historical approval lacks enough exact provider identity to construct
-- a trustworthy intent. Such a mission must be returned to review/reapproved,
-- not grandfathered as an ambiguous executable candidate.
do $$
declare
  v_invalid_count integer;
begin
  select count(*)
    into v_invalid_count
    from missions m
    join projects p on p.id = m.project_id
   where m.status = 'approved'
     and lower(coalesce(p.repo_identifier, '')) = 'jussray/founder-control-room'
     and (
       coalesce(m.branch_ref, '') = ''
       or lower(coalesce(m.policy_snapshot ->> 'expectedHeadSha', '')) !~ '^[0-9a-f]{40}$'
       or lower(coalesce(m.policy_snapshot -> 'independentReview' ->> 'baseSha', '')) !~ '^[0-9a-f]{40}$'
       or lower(coalesce(m.policy_snapshot -> 'independentReview' ->> 'policyHash', '')) !~ '^[0-9a-f]{64}$'
       or btrim(coalesce(m.policy_snapshot -> 'independentReview' ->> 'authorIdentity', '')) = ''
       or coalesce(m.policy_snapshot -> 'independentReview' ->> 'pullRequestNumber', '') !~ '^[1-9][0-9]*$'
       or not exists (
         select 1
           from proof_gate_results pgr
          where pgr.mission_id = m.id
            and pgr.project_id = m.project_id
            and pgr.gate_id = 'merge'
            and pgr.status = 'pass'
            and coalesce(btrim(pgr.approved_by), '') <> ''
       )
     );

  if v_invalid_count > 0 then
    raise exception
      'Merge-intent liveness migration blocked: % approved FCR mission(s) lack exact provider/proof identity and must be re-reviewed before migration',
      v_invalid_count;
  end if;
end;
$$;

insert into merge_intents (
  mission_id,
  project_id,
  repository,
  pull_request_number,
  target_branch,
  source_branch,
  approved_base_sha,
  approved_head_sha,
  approved_diff_hash,
  approval_proof_id,
  approved_by,
  approved_author_identity,
  review_policy_hash,
  proof_expires_at,
  state,
  stale_reason,
  failure_count,
  updated_at
)
select
  m.id,
  m.project_id,
  lower(p.repo_identifier),
  (m.policy_snapshot -> 'independentReview' ->> 'pullRequestNumber')::integer,
  coalesce(nullif(m.base_ref, ''), 'main'),
  m.branch_ref,
  lower(m.policy_snapshot -> 'independentReview' ->> 'baseSha'),
  lower(m.policy_snapshot ->> 'expectedHeadSha'),
  null,
  proof.id,
  proof.approved_by,
  btrim(m.policy_snapshot -> 'independentReview' ->> 'authorIdentity'),
  lower(m.policy_snapshot -> 'independentReview' ->> 'policyHash'),
  proof.ran_at + interval '15 minutes',
  case
    when proof.ran_at < now() - interval '15 minutes' then 'expired'
    else 'waiting'
  end,
  case
    when proof.ran_at < now() - interval '15 minutes'
      then 'historical approved merge proof expired before merge-intent liveness migration'
    else null
  end,
  0,
  now()
from missions m
join projects p on p.id = m.project_id
cross join lateral (
  select pgr.id, pgr.approved_by, pgr.ran_at
    from proof_gate_results pgr
   where pgr.mission_id = m.id
     and pgr.project_id = m.project_id
     and pgr.gate_id = 'merge'
     and pgr.status = 'pass'
     and coalesce(btrim(pgr.approved_by), '') <> ''
   order by pgr.ran_at desc, pgr.id desc
   limit 1
) proof
where m.status = 'approved'
  and lower(coalesce(p.repo_identifier, '')) = 'jussray/founder-control-room'
on conflict (mission_id) do nothing;

-- Postcondition: installation itself proves enumeration completeness for the
-- current approved FCR set. Future transitions are protected by the trigger.
do $$
declare
  v_missing_count integer;
begin
  select count(*)
    into v_missing_count
    from missions m
    join projects p on p.id = m.project_id
    left join merge_intents mi on mi.mission_id = m.id
   where m.status = 'approved'
     and lower(coalesce(p.repo_identifier, '')) = 'jussray/founder-control-room'
     and mi.id is null;

  if v_missing_count > 0 then
    raise exception
      'Merge-intent liveness postcondition failed: % approved FCR mission(s) remain unenumerated',
      v_missing_count;
  end if;
end;
$$;

commit;
