import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = path.resolve(
  process.cwd(),
  'supabase/migrations/20260906002500_harden_residual_trigger_function_authority.sql',
);
const sql = fs.readFileSync(migrationPath, 'utf8');

const triggerOnlyFunctions = [
  'bump_merge_intent_revision_on_approval_identity_change',
  'enforce_fcr_merge_intent_execution_veto',
  'enqueue_merge_intent_reconciliation',
  'project_fcr_merge_intent_on_approval',
  'project_merge_intent_execution_lifecycle',
  'project_merge_intent_mission_lifecycle',
  'return_revoked_fcr_merge_to_review',
] as const;

describe('residual trigger-function authority hardening', () => {
  it('revokes browser-role EXECUTE from every trigger-only SECURITY DEFINER surface', () => {
    for (const functionName of triggerOnlyFunctions) {
      expect(sql).toContain(`revoke all on function public.${functionName}()`);
    }

    const browserRevokes = sql.match(/from public, anon, authenticated;/g) ?? [];
    expect(browserRevokes).toHaveLength(triggerOnlyFunctions.length);
    expect(sql).not.toMatch(/grant\s+execute[\s\S]*?\b(?:anon|authenticated)\b/i);
  });

  it('pins the LinkedIn updated-at trigger search path to pg_catalog', () => {
    expect(sql).toContain('alter function public.update_linkedin_experiments_updated_at()');
    expect(sql).toContain('set search_path = pg_catalog;');
  });

  it('keeps the change source-only until separate production authority exists', () => {
    expect(sql).toContain('This migration is source-only until an explicitly authorized production apply.');
    expect(sql).toContain('Committing it performs no provider or production database mutation.');
  });
});
