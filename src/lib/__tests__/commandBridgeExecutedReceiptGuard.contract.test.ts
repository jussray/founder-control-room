import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260920162500_command_bridge_executed_receipt_guard.sql'),
  'utf8',
);

describe('Command Bridge executed receipt database invariant', () => {
  it('requires approved, unexpired, read-only authority', () => {
    expect(migration).toContain("old.status is distinct from 'approved'");
    expect(migration).toContain('old.expires_at <= now()');
    expect(migration).toContain("old.risk is distinct from 'read'");
  });

  it('requires exact successful non-truncated terminal evidence', () => {
    expect(migration).toContain('v_run.project_id is distinct from old.project_id');
    expect(migration).toContain('v_run.mission_id is distinct from old.mission_id');
    expect(migration).toContain('v_run.command_id is distinct from old.command_id');
    expect(migration).toContain('lower(v_run.expected_commit_sha) is distinct from lower(old.expected_commit_sha)');
    expect(migration).toContain('lower(v_run.observed_commit_sha) is distinct from lower(old.expected_commit_sha)');
    expect(migration).toContain("v_run.status is distinct from 'passed'");
    expect(migration).toContain('v_run.finished_at is null');
    expect(migration).toContain('v_run.output_truncated is distinct from false');
  });
});
