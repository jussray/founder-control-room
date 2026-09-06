import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260905032000_founder_content_approval_editorial_pattern_history.sql',
);

describe('founder-content approval editorial-pattern history contract', () => {
  const migration = readFileSync(migrationPath, 'utf8');

  it('stores fingerprint-only immutable approval history behind RLS', () => {
    expect(migration).toContain('create table if not exists public.founder_content_approval_editorial_pattern_history');
    expect(migration).toContain('approval_id         text primary key');
    expect(migration).toContain('pattern_fingerprint text not null');
    expect(migration).toContain('enable row level security');
    expect(migration).toContain('grant select on table public.founder_content_approval_editorial_pattern_history to service_role');
    expect(migration).toContain('revoke all on table public.founder_content_approval_editorial_pattern_history from service_role');
    expect(migration).not.toMatch(/core_thesis|primary_hook|draft_text|post_copy/i);
  });

  it('captures issuance in the active-reservation transaction and fails closed on conflicting identity', () => {
    expect(migration).toContain('capture_founder_content_approval_editorial_pattern_history');
    expect(migration).toContain('after insert or update of approval_id, founder_user_id, platform, pattern_fingerprint');
    expect(migration).toContain('on public.founder_content_active_editorial_pattern_reservations');
    expect(migration).toContain("raise exception 'FOUNDER_CONTENT_APPROVAL_PATTERN_HISTORY_CONFLICT'");
    expect(migration).toContain('on conflict (approval_id) do nothing');
  });

  it('backfills every approval-pattern binding still recoverable from the active lease ledger', () => {
    expect(migration).toContain('from public.founder_content_active_editorial_pattern_reservations as reservations');
    expect(migration).toContain('reservations.pattern_fingerprint');
    expect(migration).toContain('reservations.reserved_at');
  });
});
