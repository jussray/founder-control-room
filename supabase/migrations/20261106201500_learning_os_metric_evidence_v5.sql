-- Learning OS v5: "improved" requires a metric comparison inside the
-- independently verified downstream outcome, never just caller-supplied values.
create function public.learning_measured_improvement_guard()
returns trigger language plpgsql security invoker set search_path=public as $$
declare o public.outcomes; a public.learning_applications;
begin
  select * into o from public.outcomes where id=new.downstream_outcome_id;
  select * into a from public.learning_applications where id=new.application_id;
  if a.id is null or o.id is null or a.target_outcome_id is distinct from o.id
    or a.cited_by_mission_id is distinct from o.mission_id
    or o.observed_at is null
    or o.classification not in ('achieved','partial','failed')
    or nullif(btrim(o.verification_method),'') is null
    or jsonb_typeof(o.evidence) is distinct from 'array'
    or jsonb_array_length(o.evidence)=0
  then raise exception 'LEARNING_REVIEW_DOWNSTREAM_OUTCOME_MISMATCH'; end if;

  if new.demonstrated_improvement then
    if new.outcome<>'held' or new.metric_before is null or new.metric_after is null
      or new.better_when not in ('higher','lower')
      or not (
        (new.better_when='higher' and new.metric_after>new.metric_before)
        or (new.better_when='lower' and new.metric_after<new.metric_before)
      )
      or not o.evidence @> jsonb_build_array(jsonb_build_object(
        'type','verified_metric_comparison',
        'before',new.metric_before,
        'after',new.metric_after,
        'betterWhen',new.better_when
      ))
    then raise exception 'LEARNING_BASELINE_EVIDENCE_REQUIRED'; end if;
  end if;
  return new;
end $$;
create trigger learning_measured_improvement_before_insert
before insert on public.learning_application_reviews
for each row execute function public.learning_measured_improvement_guard();
revoke all on function public.learning_measured_improvement_guard()
  from public,anon,authenticated;
