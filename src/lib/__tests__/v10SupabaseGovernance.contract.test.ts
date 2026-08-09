import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = path.resolve(
  process.cwd(),
  'supabase/migrations/20260809072500_v10_capability_governance.sql',
);
const sql = fs.readFileSync(migrationPath, 'utf8');

describe('Supabase V10 capability governance migration', () => {
  it('persists exact privileged execution identity without making historical rows invalid', () => {
    for (const column of [
      'project_slug',
      'expected_head_sha',
      'capability_plan_hash',
      'registry_hash',
      'plan_contract',
      'requested_authority',
    ]) {
      expect(sql).toContain(`add column if not exists ${column}`);
    }
    expect(sql).toContain("check (expected_head_sha is null or expected_head_sha ~ '^[0-9a-f]{40}$')");
    expect(sql).toContain("check (capability_plan_hash is null or capability_plan_hash ~ '^[0-9a-f]{64}$')");
  });

  it('keeps trusted registry snapshots service-role-only and separate from receipt identity', () => {
    expect(sql).toContain('create table if not exists public.capability_registry_snapshots');
    expect(sql).toContain("status in ('candidate', 'approved', 'retired')");
    expect(sql).toContain('to service_role');
    expect(sql).toContain('revoke all on table public.capability_registry_snapshots from anon, authenticated');
    expect(sql).toContain('create or replace function public.is_v10_registry_approved');
    expect(sql).toContain('set search_path = pg_catalog, public');
    expect(sql).not.toContain('security definer');
  });

  it('blocks legacy merge/create_branch reservations unless the V10 envelope and registry are valid', () => {
    expect(sql).toContain('create or replace function private.enforce_v10_approval_execution_binding()');
    expect(sql).toContain("if new.action_type not in ('merge', 'create_branch') then");
    expect(sql).toContain("raise exception 'V10_BINDING_REQUIRED");
    expect(sql).toContain("raise exception 'V10_PROJECT_BINDING_MISMATCH'");
    expect(sql).toContain("raise exception 'V10_REGISTRY_NOT_APPROVED'");
    expect(sql).toContain('before insert on public.approval_executions');
  });

  it('stores sanitized conveyor receipts without equating observation with registry approval', () => {
    expect(sql).toContain('create table if not exists public.capability_execution_receipts');
    expect(sql).toContain("receipt_id ~ '^fcr-conveyor-receipt-v3:[0-9a-f]{64}$'");
    expect(sql).toContain('evidence_digest text');
    expect(sql).toContain('Registry approval is checked separately');
    expect(sql).not.toMatch(/capability_execution_receipts[\s\S]{0,600}references public\.capability_registry_snapshots/);
    expect(sql).toContain('revoke all on table public.capability_execution_receipts from anon, authenticated');
  });

  it('hardens only the public onboarding trigger search path, not managed Stripe functions', () => {
    expect(sql).toContain('alter function public.update_onboarding_updated_at() set search_path = pg_catalog, public');
    expect(sql).not.toMatch(/alter function stripe\./i);
  });
});
