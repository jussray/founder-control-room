import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = path.resolve(
  process.cwd(),
  'supabase/migrations/20260904221500_founder_content_active_editorial_pattern_reservation.sql',
);
const sourcePath = path.resolve(process.cwd(), 'src/lib/founderContentApprovalStore.ts');
const sql = fs.readFileSync(migrationPath, 'utf8');
const source = fs.readFileSync(sourcePath, 'utf8');

describe('founder-content active editorial-pattern reservation migration', () => {
  it('keeps active pattern reservation separate from immutable approval history', () => {
    expect(sql).toContain('create table if not exists public.founder_content_active_editorial_pattern_reservations');
    expect(sql).toContain('primary key (founder_user_id, platform, pattern_fingerprint)');
    expect(sql).toContain('references public.founder_content_approvals(approval_id) on delete restrict');
    expect(sql).not.toMatch(/delete from public\.founder_content_approvals/i);
    expect(sql).not.toMatch(/update public\.founder_content_approvals/i);
  });

  it('serializes issuance and keeps the pattern reserved through provider/readback latency', () => {
    expect(sql).toContain('create or replace function public.issue_founder_content_approval_with_pattern_reservation');
    expect(sql).toContain('pg_catalog.pg_advisory_xact_lock');
    expect(sql).toContain('pg_catalog.hashtextextended');
    expect(sql).toContain('approvals.revoked_at is null');
    expect(sql).toContain('approvals.expires_at > p_approved_at');
    expect(sql).not.toContain('approvals.consumed_at is null');
    expect(sql).toContain('Consumption is intentionally NOT a release signal.');
    expect(sql).toContain('insert into public.founder_content_approvals');
    expect(sql).toContain('on conflict (founder_user_id, platform, pattern_fingerprint)');
  });

  it('routes production issuance through the atomic pattern-reservation RPC', () => {
    expect(source).toContain("client.rpc(\n        'issue_founder_content_approval_with_pattern_reservation'");
    expect(source).toContain('p_pattern_fingerprint: input.editorialPatternFingerprint');
    expect(source).toContain('editorialPatternFingerprint: novelty.promptOsPatternFingerprint');
    expect(source).toContain('publicPatternFingerprint: novelty.publicCopyFingerprint');
    expect(source).not.toMatch(/\.from\('founder_content_approvals'\)\s*\.insert\(/);
  });

  it('fails closed on malformed identity and keeps the RPC service-role-only', () => {
    expect(sql).toContain("normalized_pattern_fingerprint !~ '^[0-9a-f]{64}$'");
    expect(sql).toContain("lower(btrim(coalesce(p_source_commit_sha, ''))) !~ '^[0-9a-f]{40}$'");
    expect(sql).toContain('security definer');
    expect(sql).toContain('set search_path = pg_catalog');
    expect(sql).toContain('from anon;');
    expect(sql).toContain('from authenticated;');
    expect(sql).toContain('to service_role;');
  });

  it('states the source-only boundary instead of claiming a production apply', () => {
    expect(sql).toContain('This migration is source-only until an explicitly authorized apply.');
    expect(sql).toContain('committing it performs no provider or production database mutation.');
  });
});
