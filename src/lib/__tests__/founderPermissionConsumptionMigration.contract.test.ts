import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = path.resolve(
  process.cwd(),
  'supabase/migrations/20260901001000_make_founder_permission_consumption_irreversible.sql',
);
const sql = fs.readFileSync(migrationPath, 'utf8');

describe('founder permission consumption migration contract', () => {
  it('keeps the existing authority identity guard and makes consumption monotonic', () => {
    expect(sql).toContain(
      'create or replace function public.enforce_founder_permission_identity_immutability()',
    );
    expect(sql).toContain('if old.consumed_at is not null');
    expect(sql).toContain('new.consumed_at is distinct from old.consumed_at');
    expect(sql).toContain("raise exception 'founder permission consumption is irreversible'");
    expect(sql).toContain("using errcode = '23514'");
  });

  it('allows only the initial NULL-to-timestamp consume without rewriting historical trigger identity', () => {
    expect(sql).not.toMatch(/if\s+old\.consumed_at\s+is\s+null[\s\S]{0,120}raise exception/i);
    expect(sql).not.toContain('drop trigger if exists founder_permission_identity_immutability');
    expect(sql).not.toContain('create trigger founder_permission_identity_immutability');
    expect(sql).not.toMatch(/alter\s+table\s+public\.founder_permission_requests\s+drop/i);
  });

  it('leaves revocation independently mutable while preserving request and decision immutability', () => {
    expect(sql).toContain("raise exception 'founder permission request identity is immutable'");
    expect(sql).toContain("raise exception 'founder permission decision identity is immutable'");
    expect(sql).not.toMatch(/new\.revoked_at\s+is\s+distinct\s+from\s+old\.revoked_at/i);
  });
});
