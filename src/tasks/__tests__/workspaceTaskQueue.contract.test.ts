import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261118090000_fcr_workspace_task_queue.sql'),
  'utf8',
);

describe('workspace task queue migration safety contract', () => {
  it('enforces exact tenant and owner database relationships, not app filtering alone', () => {
    expect(source).toMatch(/foreign key \(owner_user_id, workspace_id\)[\s\S]*?references public\.founder_users\(user_id, workspace_id\)/);
    expect(source).toMatch(/foreign key \(project_id, workspace_id\)[\s\S]*?references public\.projects\(id, workspace_id\)/);
    expect(source).toMatch(/fcr_task_run_claim_owner_fk foreign key \(task_id, workspace_id, owner_user_id\)/);
  });

  it('defaults tasks to paused and grants to revoked, with read-only capability', () => {
    expect(source).toContain("state text not null default 'paused'");
    expect(source).toContain("state text not null default 'revoked'");
    expect(source).toContain("check (scope = 'READ')");
    expect(source).toContain("check (capability_id = 'public-web-observation-v1')");
    expect(source).toMatch(/insert into public\.fcr_workspace_task_grants[\s\S]*?'READ', 'revoked'/);
  });

  it('denies browser direct access and exposes only service-role RPC execution', () => {
    for (const table of ['fcr_workspace_tasks', 'fcr_workspace_task_grants', 'fcr_workspace_task_runs']) {
      expect(source).toContain(`alter table public.${table} enable row level security;`);
    }
    expect(source).toMatch(/revoke all on public\.fcr_workspace_tasks from public/);
    expect(source).toMatch(/revoke all on public\.fcr_workspace_task_grants from public/);
    expect(source).toMatch(/revoke all on public\.fcr_workspace_task_runs from public/);
    expect(source).toContain("revoke all on function public.claim_due_fcr_workspace_tasks(integer) from public");
    expect(source).toContain("revoke all on function public.create_fcr_workspace_task_draft(uuid,uuid,uuid,text,integer) from public");
    expect(source).toContain('security invoker');
    expect(source).not.toContain('security definer');
  });

  it('claims atomically with skip-locked rows and one-run-per-scheduled-slot', () => {
    expect(source).toContain('for update of t skip locked');
    expect(source).toContain('on conflict (task_id, scheduled_for) do nothing');
    expect(source).toContain('constraint fcr_task_run_one_per_due unique (task_id, scheduled_for)');
    expect(source).toContain("g.state = 'active' and g.expires_at > v_now");
    expect(source).toContain("t.state = 'enabled' and t.next_due_at <= v_now");
    expect(source).toContain("g.scope = 'READ'");
  });

  it('records provider observation without promoting it to independently verified', () => {
    expect(source).toContain("'provider_observed_unverified'");
    expect(source).toMatch(/where id = p_run_id and task_id = p_task_id[\\s\\S]*?and workspace_id = p_workspace_id and owner_user_id = p_owner_user_id[\\s\\S]*?and state = 'claimed' and expires_at > clock_timestamp\\(\\)/);
    expect(source).not.toMatch(/'verified'\s*,/);
    expect(source).toContain('p_evidence_fingerprint is null or p_provider_receipt_id is null');
  });

  it('creates an inert draft and grant in the same SQL transaction', () => {
    expect(source).toContain('create or replace function public.create_fcr_workspace_task_draft');
    expect(source).toContain('insert into public.fcr_workspace_tasks');
    expect(source).toContain('insert into public.fcr_workspace_task_grants');
    expect(source).toContain("'READ', 'revoked', clock_timestamp()");
  });
});
