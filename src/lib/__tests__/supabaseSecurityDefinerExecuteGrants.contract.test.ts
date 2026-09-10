import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL(
    '../../../supabase/migrations/20260910234000_harden_security_definer_execute_grants.sql',
    import.meta.url,
  ),
  'utf8',
).toLowerCase();

const privilegedFunctions = [
  'anonymize_user_audit_logs(uuid)',
  'bump_merge_intent_revision_on_approval_identity_change()',
  'enforce_fcr_merge_intent_execution_veto()',
  'enqueue_merge_intent_reconciliation()',
  'project_fcr_merge_intent_on_approval()',
  'project_merge_intent_execution_lifecycle()',
  'project_merge_intent_mission_lifecycle()',
  'purge_stale_devices()',
  'return_revoked_fcr_merge_to_review()',
];

describe('Supabase SECURITY DEFINER execute-grant hardening', () => {
  it('removes direct browser-role execution from every privileged function', () => {
    for (const signature of privilegedFunctions) {
      expect(migration).toContain(
        `revoke all on function public.${signature}\n  from public, anon, authenticated;`,
      );
    }
  });

  it('preserves explicit server execution through service_role', () => {
    for (const signature of privilegedFunctions) {
      expect(migration).toContain(
        `grant execute on function public.${signature}\n  to service_role;`,
      );
    }
  });

  it('changes grants only and does not redefine privileged function bodies', () => {
    expect(migration).not.toContain('create or replace function');
    expect(migration).not.toContain('drop function');
    expect(migration).not.toContain('drop trigger');
    expect(migration).not.toContain('create trigger');
  });
});
