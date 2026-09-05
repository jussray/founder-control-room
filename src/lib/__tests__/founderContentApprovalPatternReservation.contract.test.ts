import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const patternMigrationPath = path.resolve(
  process.cwd(),
  'supabase/migrations/20260904221500_founder_content_active_editorial_pattern_reservation.sql',
);
const copyMigrationPath = path.resolve(
  process.cwd(),
  'supabase/migrations/20260905212100_founder_content_active_public_copy_reservation.sql',
);
const sourcePath = path.resolve(process.cwd(), 'src/lib/founderContentApprovalStore.ts');
const patternSql = fs.readFileSync(patternMigrationPath, 'utf8');
const copySql = fs.readFileSync(copyMigrationPath, 'utf8');
const source = fs.readFileSync(sourcePath, 'utf8');

describe('founder-content active copy + editorial-pattern reservation migrations', () => {
  it('keeps both active reservations separate from immutable approval history', () => {
    expect(patternSql).toContain('create table if not exists public.founder_content_active_editorial_pattern_reservations');
    expect(patternSql).toContain('primary key (founder_user_id, platform, pattern_fingerprint)');
    expect(copySql).toContain('create table if not exists public.founder_content_active_public_copy_reservations');
    expect(copySql).toContain('primary key (founder_user_id, platform, public_copy_fingerprint)');
    expect(copySql).toContain('references public.founder_content_approvals(approval_id) on delete restrict');
    expect(copySql).not.toMatch(/delete from public\.founder_content_approvals/i);
    expect(copySql).not.toMatch(/update public\.founder_content_approvals/i);
  });

  it('serializes exact-copy and editorial-pattern authority in one transaction', () => {
    expect(copySql).toContain('create or replace function public.issue_founder_content_approval_with_active_reservations');
    expect(copySql).toContain("'copy' || E'\\x1f'");
    expect(copySql).toContain("'pattern' || E'\\x1f'");
    expect(copySql).toContain('elsif copy_lock < pattern_lock then');
    expect(copySql).toContain('perform pg_catalog.pg_advisory_xact_lock(copy_lock);');
    expect(copySql).toContain('perform pg_catalog.pg_advisory_xact_lock(pattern_lock);');
    expect(copySql).not.toContain('pg_catalog.least');
    expect(copySql).not.toContain('pg_catalog.greatest');
    expect(copySql).toContain('approvals.revoked_at is null');
    expect(copySql).toContain('approvals.expires_at > p_approved_at');
    expect(copySql).not.toContain('approvals.consumed_at is null');
    expect(copySql).toContain('insert into public.founder_content_approvals');
    expect(copySql).toContain('on conflict (founder_user_id, platform, public_copy_fingerprint)');
    expect(copySql).toContain('on conflict (founder_user_id, platform, pattern_fingerprint)');
  });

  it('routes production issuance through the atomic dual-reservation RPC', () => {
    expect(source).toContain("client.rpc(\n        'issue_founder_content_approval_with_active_reservations'");
    expect(source).toContain('p_public_copy_fingerprint: input.publicCopyFingerprint');
    expect(source).toContain('p_pattern_fingerprint: input.editorialPatternFingerprint');
    expect(source).toContain('publicCopyFingerprint: novelty.publicCopyFingerprint');
    expect(source).toContain('editorialPatternFingerprint: novelty.promptOsPatternFingerprint');
    expect(source).not.toMatch(/\.from\('founder_content_approvals'\)\s*\.insert\(/);
  });

  it('versions immutable approval row identity while keeping active reservations authoritative', () => {
    expect(source).toContain("contract: 'fcr/founder-content-approval-reservation@v5'");
    expect(source).toContain('publicCopyFingerprint: text(publicCopyFingerprint).toLowerCase()');
    expect(source).toContain("approvedAt: new Date(parseTime(approvedAt, 'approval issuance time')).toISOString()");
    expect(copySql).toContain('Revocation or expiry');
    expect(copySql).toContain('provider execution/readback may still be in flight');
  });

  it('fails closed on malformed identity and keeps the new RPC service-role-only', () => {
    expect(copySql).toContain("normalized_public_copy_fingerprint !~ '^[0-9a-f]{64}$'");
    expect(copySql).toContain("normalized_pattern_fingerprint !~ '^[0-9a-f]{64}$'");
    expect(copySql).toContain("lower(btrim(coalesce(p_source_commit_sha, ''))) !~ '^[0-9a-f]{40}$'");
    expect(copySql).toContain('security definer');
    expect(copySql).toContain('set search_path = pg_catalog');
    expect(copySql).toContain('from anon;');
    expect(copySql).toContain('from authenticated;');
    expect(copySql).toContain('to service_role;');
  });

  it('states the source-only boundary instead of claiming a production apply', () => {
    expect(copySql).toContain('This migration is source-only until an explicitly authorized apply.');
    expect(copySql).toContain('committing it performs no provider or production database mutation.');
  });
});
