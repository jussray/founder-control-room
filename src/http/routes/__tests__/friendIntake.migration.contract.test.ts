import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationPath = 'supabase/migrations/20260909031700_friend_intake_v1.sql';

function processRunEventBlock(sql: string): string {
  const start = sql.indexOf('insert into public.project_events (');
  const end = sql.indexOf("if p_privacy_choice = 'save_redacted_summary' then", start);
  if (start < 0 || end < 0) throw new Error('Friend Intake run event block not found');
  return sql.slice(start, end);
}

describe('Friend Intake migration privacy contract', () => {
  it('keeps the general run timeline receipt behavior-only and names saved derived labels truthfully', () => {
    const sql = readFileSync(migrationPath, 'utf8');
    const eventBlock = processRunEventBlock(sql);

    expect(eventBlock).toContain("'processed'");
    expect(eventBlock).toContain("'privacy_choice', p_privacy_choice");
    expect(eventBlock).toContain("'model_execution_state', p_model_execution_state");
    expect(eventBlock).toContain("'provenance_id', p_provenance_id");
    expect(eventBlock).toContain("'input_persistence'");
    expect(eventBlock).toContain("'redacted_summary_and_derived_labels'");

    expect(eventBlock).not.toContain("'sensitive_categories'");
    expect(eventBlock).not.toContain("'intent_tag_ids'");
    expect(eventBlock).not.toContain("'move_kind'");
    expect(eventBlock).not.toContain("'move_policy'");
    expect(eventBlock).not.toContain('p_redacted_summary');
  });

  it('makes each stored provenance id durably resolvable through the linked timeline event', () => {
    const sql = readFileSync(migrationPath, 'utf8');
    const eventBlock = processRunEventBlock(sql);

    expect(sql).toContain('provenance_id uuid not null');
    expect(sql).toContain('timeline_event_id uuid not null references public.project_events(id) on delete restrict');
    expect(eventBlock).toContain("'provenance_id', p_provenance_id");
    expect(eventBlock).toContain("'provenance_kind', 'deterministic_rule_engine'");
    expect(eventBlock).toContain("'engine_version', 'first-slice-v1'");
  });

  it('keeps Friend Intake content persistence server-owned and service-role-only', () => {
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toContain('alter table public.intake_sessions enable row level security;');
    expect(sql).toContain(
      'revoke all privileges on table public.intake_sessions from public, anon, authenticated;',
    );
    expect(sql).toContain('grant all privileges on table public.intake_sessions to service_role;');
    expect(sql).not.toContain('create policy "Founder insert own friend intake"');
    expect(sql).not.toContain('create policy "Founder read own friend intake"');
    expect(sql).not.toContain('create policy "Founder update own friend intake"');
    expect(sql).not.toContain('create policy "Founder delete own friend intake"');
  });

  it('prevents auth-user deletion from silently cascading into saved intake history', () => {
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toContain('founder_id uuid not null references auth.users(id) on delete restrict');
    expect(sql).not.toContain('founder_id uuid not null references auth.users(id) on delete cascade');
  });

  it('makes sensitive-save review a database invariant and one review maps to one primary-key identity', () => {
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toContain('intake_id uuid primary key');
    expect(sql).toContain('sensitive_save_reviewed boolean not null default false');
    expect(sql).toContain('constraint intake_sessions_sensitive_save_reviewed check');
    expect(sql).toContain('cardinality(sensitive_categories) = 0 or sensitive_save_reviewed');
    expect(sql).toContain('p_sensitive_save_reviewed boolean');
    expect(sql).toContain("raise exception 'friend_intake_sensitive_save_review_required'");
    expect(sql).toContain('p_sensitive_save_reviewed,');
  });

  it('appends usefulness corrections while keeping exact-event retries idempotent', () => {
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toContain("'friend-intake-usefulness:' || p_run_id::text || ':' || p_event_id::text");
    expect(sql).toContain('on conflict (project_id, source_event_id) do nothing;');
    expect(sql).toContain('if not found then\n    return;');
    expect(sql).not.toContain('do update set\n    decision = excluded.decision');
    expect(sql).toContain('set usefulness_response = p_response');
  });
});