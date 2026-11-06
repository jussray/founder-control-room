-- Learning OS v1: independent knowledge lifecycle; FCR retains all execution authority.
-- SOURCE ONLY until exact-head tests and a separately approved migration apply.
-- Uses actual FCR outcomes and approval_executions, not an imaginary fcr_receipts table.
begin;

-- Explicit server-owned classification: missions have no native domain column.
-- A model-supplied target_domain is never enough to claim a cross-domain reuse.
create table public.learning_mission_domains (
  mission_id uuid primary key references public.missions(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  domain text not null check (length(btrim(domain)) between 2 and 64),
  source_ref text not null check (length(btrim(source_ref)) between 8 and 300),
  recorded_at timestamptz not null default now()
);
create function public.learning_domain_guard() returns trigger
language plpgsql security invoker set search_path=public as $$
begin
  if not exists(select 1 from public.missions where id=new.mission_id and project_id=new.project_id) then
    raise exception 'LEARNING_DOMAIN_PROJECT_MISMATCH';
  end if;
  return new;
end $$;
create trigger learning_domain_insert_guard before insert on public.learning_mission_domains
for each row execute function public.learning_domain_guard();

create table public.learning_records (
  id uuid primary key default gen_random_uuid(),
  outcome_id uuid not null unique references public.outcomes(id) on delete restrict,
  origin_execution_id uuid not null references public.approval_executions(id) on delete restrict,
  origin_mission_id uuid not null references public.missions(id) on delete restrict,
  origin_project_id uuid not null references public.projects(id) on delete restrict,
  origin_head_sha text not null check (origin_head_sha ~ '^[0-9a-f]{40}$'),
  domain text not null check (length(btrim(domain)) between 2 and 64),
  state text not null default 'OUTCOME_RECORDED'
    check (state in ('OUTCOME_RECORDED','SIGNAL_EXTRACTED','INTERPRETED','RETAINED','APPLIED','REVISED','RETIRED')),
  outcome_summary text not null check (length(btrim(outcome_summary)) between 5 and 2000),
  observed_by text not null check (observed_by in ('founder','ci','runtime','browser','provider')),
  expires_at timestamptz not null default (now() + interval '90 days'),
  retirement_approval_id uuid unique references public.founder_permission_requests(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index learning_records_domain_state_idx on public.learning_records(domain,state,expires_at);

create table public.learning_signals (
  id uuid primary key default gen_random_uuid(),
  learning_id uuid not null references public.learning_records(id) on delete restrict,
  signal_class text not null check (signal_class in ('surprising','costly','repeatable','contradictory')),
  description text not null check (length(btrim(description)) between 8 and 2000),
  evidence_refs jsonb not null check (jsonb_typeof(evidence_refs)='array' and jsonb_array_length(evidence_refs)>0),
  created_at timestamptz not null default now()
);
create index learning_signals_case_idx on public.learning_signals(learning_id);

create table public.learning_interpretations (
  id uuid primary key default gen_random_uuid(),
  learning_id uuid not null references public.learning_records(id) on delete restrict,
  hypothesis text not null check (length(btrim(hypothesis)) between 8 and 2000),
  confidence text not null check (confidence in ('low','medium','high')),
  confidence_basis text not null check (length(btrim(confidence_basis)) between 8 and 2000),
  created_at timestamptz not null default now()
);
create index learning_interpretations_case_idx on public.learning_interpretations(learning_id);

create table public.learning_applications (
  id uuid primary key default gen_random_uuid(),
  learning_id uuid not null references public.learning_records(id) on delete restrict,
  cited_by_execution_id uuid not null references public.approval_executions(id) on delete restrict,
  cited_by_mission_id uuid not null references public.missions(id) on delete restrict,
  target_head_sha text not null check (target_head_sha ~ '^[0-9a-f]{40}$'),
  target_domain text not null check (length(btrim(target_domain)) between 2 and 64),
  cross_domain_reason text,
  how_applied text not null check (length(btrim(how_applied)) between 8 and 2000),
  applied_at timestamptz not null default now(),
  unique(learning_id, cited_by_execution_id),
  unique(learning_id, cited_by_mission_id)
);
create index learning_applications_target_idx on public.learning_applications(cited_by_mission_id);

create table public.learning_application_reviews (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references public.learning_applications(id) on delete restrict,
  downstream_outcome_id uuid not null unique references public.outcomes(id) on delete restrict,
  outcome text not null check (outcome in ('held','failed','partial')),
  demonstrated_improvement boolean not null default false,
  metric_before numeric,
  metric_after numeric,
  better_when text check (better_when in ('higher','lower')),
  evidence_refs jsonb not null check (jsonb_typeof(evidence_refs)='array' and jsonb_array_length(evidence_refs)>0),
  revision text not null check (length(btrim(revision)) between 8 and 2000),
  observed_at timestamptz not null default now(),
  check (not demonstrated_improvement or (
    outcome='held' and metric_before is not null and metric_after is not null
    and ((better_when='higher' and metric_after>metric_before)
      or (better_when='lower' and metric_after<metric_before))
  ))
);

create function public.learning_record_guard() returns trigger
language plpgsql security invoker set search_path = public
as $$
declare v_o record; v_e record;
begin
  select * into v_o from public.outcomes where id = new.outcome_id;
  select * into v_e from public.approval_executions where id = new.origin_execution_id;
  if v_o.id is null or v_e.id is null or v_o.mission_id is distinct from new.origin_mission_id
     or v_e.mission_id is distinct from new.origin_mission_id
     or v_o.project_id is distinct from new.origin_project_id
     or v_e.project_id is distinct from new.origin_project_id
     or not exists(select 1 from public.missions m where m.id=new.origin_mission_id and m.project_id=new.origin_project_id)
     or not exists(select 1 from public.learning_mission_domains d
       where d.mission_id=new.origin_mission_id and d.project_id=new.origin_project_id and d.domain=new.domain)
     or v_e.status <> 'succeeded' or v_e.success is distinct from true or v_e.executed_at is null
     or v_e.expected_head_sha is distinct from new.origin_head_sha
     or v_o.classification not in ('achieved','partial','failed')
     or v_o.observed_at is null or v_o.observed_at < v_e.executed_at
     or nullif(btrim(v_o.verification_method),'') is null
     or jsonb_typeof(v_o.evidence) is distinct from 'array'
     or jsonb_array_length(v_o.evidence) = 0 then
    raise exception 'LEARNING_OUTCOME_NOT_EARNED: validated execution/outcome identity and evidence required';
  end if;
  return new;
end $$;
create trigger learning_record_insert_guard before insert on public.learning_records
for each row execute function public.learning_record_guard();

-- No direct edits to historical identity or skips, even by a privileged caller.
create function public.learning_transition_guard() returns trigger
language plpgsql security invoker set search_path = public
as $$
declare v_permission record;
begin
  if (new.outcome_id,new.origin_execution_id,new.origin_mission_id,new.origin_project_id,new.origin_head_sha,new.domain,
      new.outcome_summary,new.observed_by,new.expires_at,new.created_at)
     is distinct from
     (old.outcome_id,old.origin_execution_id,old.origin_mission_id,old.origin_project_id,old.origin_head_sha,old.domain,
      old.outcome_summary,old.observed_by,old.expires_at,old.created_at) then
    raise exception 'LEARNING_IMMUTABLE_IDENTITY';
  end if;
  if new.state = old.state then
    if new.retirement_approval_id is distinct from old.retirement_approval_id then
      raise exception 'LEARNING_RETIREMENT_APPROVAL_ONLY_DURING_TRANSITION';
    end if;
    return new;
  end if;
  if not (
    (old.state='OUTCOME_RECORDED' and new.state='SIGNAL_EXTRACTED') or
    (old.state='SIGNAL_EXTRACTED' and new.state='INTERPRETED') or
    (old.state='INTERPRETED' and new.state='RETAINED') or
    (old.state='RETAINED' and new.state='APPLIED') or
    (old.state='APPLIED' and new.state='REVISED') or
    (old.state <> 'RETIRED' and new.state='RETIRED')
  ) then
    raise exception 'LEARNING_INVALID_TRANSITION % -> %',old.state,new.state;
  end if;
  if new.state='SIGNAL_EXTRACTED' and not exists(select 1 from public.learning_signals where learning_id=new.id) then
    raise exception 'LEARNING_SIGNAL_PROOF_REQUIRED';
  end if;
  if new.state='INTERPRETED' and not exists(select 1 from public.learning_interpretations where learning_id=new.id) then
    raise exception 'LEARNING_INTERPRETATION_REQUIRED';
  end if;
  if new.state='APPLIED' and not exists(select 1 from public.learning_applications where learning_id=new.id) then
    raise exception 'LEARNING_APPLICATION_RECEIPT_REQUIRED';
  end if;
  if new.state='REVISED' and not exists(
    select 1 from public.learning_applications a join public.learning_application_reviews v on v.application_id=a.id
    where a.learning_id=new.id
  ) then
    raise exception 'LEARNING_APPLICATION_OUTCOME_REQUIRED';
  end if;
  if new.state='RETIRED' then
    select * into v_permission from public.founder_permission_requests
    where id=new.retirement_approval_id and status='approved' and founder_user_id is not null
      and revoked_at is null and decided_at is not null
      and (expires_at is null or expires_at>now())
      and action_target->>'action'='retire_learning'
      and action_target->>'learning_id'=new.id::text;
    if v_permission.id is null then raise exception 'LEARNING_FOUNDER_RETIREMENT_APPROVAL_REQUIRED'; end if;
  elsif new.retirement_approval_id is distinct from old.retirement_approval_id then
    raise exception 'LEARNING_RETIREMENT_APPROVAL_ONLY_FOR_RETIREMENT';
  end if;
  new.updated_at=now();
  return new;
end $$;
create trigger learning_transition_before_update before update on public.learning_records
for each row execute function public.learning_transition_guard();

-- One transaction for data insertion and state advancement. No read-then-write race.
create function public.learning_progress(p_id uuid,p_expected text,p_next text,p_payload jsonb default '{}'::jsonb)
returns public.learning_records
language plpgsql security invoker set search_path=public as $$
declare r public.learning_records; e record; a record; o record; v_id uuid;
begin
  select * into r from public.learning_records where id=p_id for update;
  if not found or r.state is distinct from p_expected then
    raise exception 'LEARNING_STALE_STATE';
  end if;
  if p_next='SIGNAL_EXTRACTED' and p_expected='OUTCOME_RECORDED' then
    insert into public.learning_signals(learning_id,signal_class,description,evidence_refs)
    values(p_id,p_payload->>'signal_class',p_payload->>'description',p_payload->'evidence_refs');
  elsif p_next='INTERPRETED' and p_expected='SIGNAL_EXTRACTED' then
    insert into public.learning_interpretations(learning_id,hypothesis,confidence,confidence_basis)
    values(p_id,p_payload->>'hypothesis',p_payload->>'confidence',p_payload->>'confidence_basis');
  elsif p_next='RETAINED' and p_expected='INTERPRETED' then
    if not exists(select 1 from public.learning_signals where learning_id=p_id) then
      raise exception 'LEARNING_SIGNAL_REQUIRED';
    end if;
  elsif p_next='APPLIED' and p_expected='RETAINED' then
    if r.expires_at<=now() then raise exception 'LEARNING_EXPIRED_REVALIDATE_FIRST'; end if;
    select * into e from public.approval_executions
    where id=(p_payload->>'cited_by_execution_id')::uuid;
    if e.id is null or e.status <> 'succeeded' or e.success is distinct from true
       or e.executed_at is null or e.mission_id is null or e.mission_id=r.origin_mission_id
       or e.project_id is distinct from (select project_id from public.missions where id=e.mission_id)
       or e.expected_head_sha is null
       or not exists(select 1 from public.learning_mission_domains d
         where d.mission_id=e.mission_id and d.project_id=e.project_id and d.domain=p_payload->>'target_domain') then
      raise exception 'LEARNING_DOWNSTREAM_EXECUTION_REQUIRED';
    end if;
    if p_payload->>'target_domain' is distinct from r.domain
      and length(btrim(coalesce(p_payload->>'cross_domain_reason','')))<12 then
      raise exception 'LEARNING_CROSS_DOMAIN_REASON_REQUIRED';
    end if;
    insert into public.learning_applications(
      learning_id,cited_by_execution_id,cited_by_mission_id,target_head_sha,target_domain,cross_domain_reason,how_applied
    ) values(
      p_id,e.id,e.mission_id,e.expected_head_sha,p_payload->>'target_domain',
      p_payload->>'cross_domain_reason',p_payload->>'how_applied'
    );
  elsif p_next='REVISED' and p_expected='APPLIED' then
    select * into a from public.learning_applications
    where learning_id=p_id order by applied_at desc,id desc limit 1;
    if a.id is null then raise exception 'LEARNING_APPLICATION_REQUIRED'; end if;
    select * into o from public.outcomes where id=(p_payload->>'downstream_outcome_id')::uuid;
    if o.id is null or o.mission_id is distinct from a.cited_by_mission_id
      or o.project_id is distinct from
        (select project_id from public.approval_executions where id=a.cited_by_execution_id)
      or o.classification not in ('achieved','partial','failed')
      or o.observed_at is null or nullif(btrim(o.verification_method),'') is null
      or jsonb_typeof(o.evidence) is distinct from 'array'
      or jsonb_array_length(o.evidence)=0 then
      raise exception 'LEARNING_DOWNSTREAM_OUTCOME_NOT_VERIFIED';
    end if;
    insert into public.learning_application_reviews(
      application_id,downstream_outcome_id,outcome,demonstrated_improvement,
      metric_before,metric_after,better_when,evidence_refs,revision
    ) values(
      a.id,o.id,p_payload->>'outcome',
      coalesce((p_payload->>'demonstrated_improvement')::boolean,false),
      (p_payload->>'metric_before')::numeric,
      (p_payload->>'metric_after')::numeric,
      p_payload->>'better_when',p_payload->'evidence_refs',p_payload->>'revision'
    );
  elsif p_next='RETIRED' and p_expected<>'RETIRED' then
    v_id:=(p_payload->>'founder_permission_id')::uuid;
    update public.learning_records set state='RETIRED',retirement_approval_id=v_id
    where id=p_id and state=p_expected returning * into r;
    return r;
  else
    raise exception 'LEARNING_ILLEGAL_TRANSITION';
  end if;
  update public.learning_records set state=p_next where id=p_id and state=p_expected returning * into r;
  if r.id is null then raise exception 'LEARNING_LOST_UPDATE'; end if;
  return r;
end $$;

-- Privileged FCR backend only, never browser, public, or ordinary authenticated.
alter table public.learning_mission_domains enable row level security;
alter table public.learning_records enable row level security;
alter table public.learning_signals enable row level security;
alter table public.learning_interpretations enable row level security;
alter table public.learning_applications enable row level security;
alter table public.learning_application_reviews enable row level security;
revoke all on public.learning_mission_domains,public.learning_records,public.learning_signals,public.learning_interpretations,
  public.learning_applications,public.learning_application_reviews from public,anon,authenticated;
grant select,insert on public.learning_mission_domains to service_role;
grant select,insert,update on public.learning_records to service_role;
grant select,insert on public.learning_signals,public.learning_interpretations,
  public.learning_applications,public.learning_application_reviews to service_role;
revoke all on function public.learning_progress(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.learning_progress(uuid,text,text,jsonb) to service_role;
revoke all on function public.learning_domain_guard() from public,anon,authenticated;
revoke all on function public.learning_record_guard() from public,anon,authenticated;
revoke all on function public.learning_transition_guard() from public,anon,authenticated;
comment on table public.learning_records is 'Learning OS observational domain. Execution/merge/deploy authority remains in FCR; source evidence and downstream application must be verified independently.';
-- Forward-only compatibility repair for three legacy RPC lint errors identified
-- by the full local schema lint. Historical migrations remain immutable.
-- Existing signatures, SECURITY modes, and EXECUTE privileges are unchanged.
-- pgcrypto lives in the trusted extensions schema in the local Supabase stack.
alter function public.truth_console_reconcile_claim(uuid, bigint)
  set search_path = public, extensions, pg_temp;

create or replace function public.claim_revenue_strike_customer_send_lease(
  p_run_id text,
  p_slot smallint,
  p_founder_user_id text,
  p_recipient_fingerprint text,
  p_prospect_fingerprint text,
  p_message_fingerprint text,
  p_offer_fingerprint text,
  p_historical_ledger_digest text,
  p_reply_gate_clear_at timestamptz,
  p_claimed_by text,
  p_claimed_at timestamptz
)
returns table (
  claim_id uuid,
  run_id text,
  slot smallint,
  recipient_fingerprint text,
  claimed_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $function$
declare
  lease_row public.revenue_strike_customer_send_leases%rowtype;
  run_send_count bigint;
begin
  if coalesce(btrim(p_run_id), '') = ''
    or p_slot is null or p_slot not between 1 and 5
    or coalesce(btrim(p_founder_user_id), '') = ''
    or coalesce(btrim(p_claimed_by), '') = ''
    or p_reply_gate_clear_at is null
    or p_claimed_at is null then
    return;
  end if;

  if lower(btrim(p_recipient_fingerprint)) !~ '^[0-9a-f]{64}$'
    or lower(btrim(p_prospect_fingerprint)) !~ '^[0-9a-f]{64}$'
    or lower(btrim(p_message_fingerprint)) !~ '^[0-9a-f]{64}$'
    or lower(btrim(p_offer_fingerprint)) !~ '^[0-9a-f]{64}$'
    or lower(btrim(p_historical_ledger_digest)) !~ '^[0-9a-f]{64}$' then
    return;
  end if;

  -- A reply-first observation is a short-lived precondition. A later reply can
  -- invalidate the batch outside this database, so stale observations fail closed.
  if p_reply_gate_clear_at > p_claimed_at
    or p_claimed_at - p_reply_gate_clear_at > interval '15 minutes' then
    return;
  end if;

  -- Serialize all lease claims for one strike run. This makes the five-send
  -- ceiling a database invariant under concurrent workers instead of a prompt counter.
  perform pg_advisory_xact_lock(hashtextextended(btrim(p_run_id), 0));

  select count(*)
    into run_send_count
    from public.revenue_strike_customer_send_leases l
   where l.run_id = btrim(p_run_id);

  if run_send_count >= 5 then
    return;
  end if;

  -- A claimed recipient is permanently ineligible for another cold-strike lease,
  -- including when a provider later rejects or returns an ambiguous result.
  if exists (
    select 1
      from public.revenue_strike_customer_send_leases l
     where l.recipient_fingerprint = lower(btrim(p_recipient_fingerprint))
  ) then
    return;
  end if;

  if exists (
    select 1
      from public.revenue_strike_customer_send_leases l
     where l.run_id = btrim(p_run_id)
       and l.slot = p_slot
  ) then
    return;
  end if;

  insert into public.revenue_strike_customer_send_leases (
    run_id,
    slot,
    founder_user_id,
    recipient_fingerprint,
    prospect_fingerprint,
    message_fingerprint,
    offer_fingerprint,
    historical_ledger_digest,
    reply_gate_clear_at,
    claimed_by,
    claimed_at,
    provider_outcome
  ) values (
    btrim(p_run_id),
    p_slot,
    btrim(p_founder_user_id),
    lower(btrim(p_recipient_fingerprint)),
    lower(btrim(p_prospect_fingerprint)),
    lower(btrim(p_message_fingerprint)),
    lower(btrim(p_offer_fingerprint)),
    lower(btrim(p_historical_ledger_digest)),
    p_reply_gate_clear_at,
    btrim(p_claimed_by),
    p_claimed_at,
    'claimed'
  )
  returning * into lease_row;

  return query
    select
      lease_row.claim_id,
      lease_row.run_id,
      lease_row.slot,
      lease_row.recipient_fingerprint,
      lease_row.claimed_at;
exception
  when unique_violation then
    return;
end;
$function$;

create or replace function public.finalize_revenue_strike_customer_send_lease(
  p_claim_id uuid,
  p_founder_user_id text,
  p_provider_outcome text,
  p_provider_receipt_id text,
  p_finalized_at timestamptz
)
returns table (
  claim_id uuid,
  provider_outcome text,
  provider_receipt_id text,
  finalized_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $function$
declare
  lease_row public.revenue_strike_customer_send_leases%rowtype;
begin
  if p_claim_id is null
    or coalesce(btrim(p_founder_user_id), '') = ''
    or p_provider_outcome not in ('accepted', 'rejected', 'unknown')
    or p_finalized_at is null
    or (p_provider_outcome = 'accepted' and coalesce(btrim(p_provider_receipt_id), '') = '') then
    return;
  end if;

  select l.*
    into lease_row
    from public.revenue_strike_customer_send_leases l
   where l.claim_id = p_claim_id
     and l.founder_user_id = btrim(p_founder_user_id)
     and l.provider_outcome = 'claimed'
     and l.finalized_at is null
   for update;

  if not found then
    return;
  end if;

  update public.revenue_strike_customer_send_leases as l
     set provider_outcome = p_provider_outcome,
         provider_receipt_id = nullif(btrim(p_provider_receipt_id), ''),
         finalized_at = p_finalized_at
   where l.claim_id = lease_row.claim_id
     and l.provider_outcome = 'claimed'
     and l.finalized_at is null
  returning * into lease_row;

  return query
    select
      lease_row.claim_id,
      lease_row.provider_outcome,
      lease_row.provider_receipt_id,
      lease_row.finalized_at;
end;
$function$;

commit;
