-- PA funding founder preparation. No submission or eligibility authority.
create table if not exists public.founder_pa_funding_reviews (
  founder_user_id uuid not null references auth.users(id),
  opportunity_id text not null check (opportunity_id in ('cea-growth','cea-impact','kiz','contracts','apex','alphalab','bftp','ssbci','creative-loan')),
  stage text not null default 'REVIEW' check (stage in ('REVIEW','VERIFY','PREPARE')),
  checks jsonb not null default '{}'::jsonb check (jsonb_typeof(checks)='object'),
  evidence_note text not null default '' check (char_length(evidence_note)<=1500),
  updated_at timestamptz not null default now(),
  primary key (founder_user_id, opportunity_id)
);
comment on table public.founder_pa_funding_reviews is 'Private review checkmarks and references; not applicant proof or a funding application.';
alter table public.founder_pa_funding_reviews enable row level security;
revoke all on public.founder_pa_funding_reviews from public, anon, authenticated;
-- Explicit grant is required when project defaults do not auto-grant service_role.
grant select, insert, update on public.founder_pa_funding_reviews to service_role;
