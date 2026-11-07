import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../../../supabase/migrations/20260824014000_authority_receipt_consumption_store.sql', import.meta.url),
  'utf8',
);

const deployWorkflow = readFileSync(
  new URL('../../../.github/workflows/deploy.yml', import.meta.url),
  'utf8',
);

describe('AuthorityReceipt consumption store contract', () => {
  it('uses receipt_id as the database-owned one-winner boundary', () => {
    expect(migration).toMatch(/receipt_id text primary key/);
    expect(migration).toMatch(/on conflict \(receipt_id\) do nothing/);
    expect(migration).toMatch(/get diagnostics inserted_count = row_count/);
    expect(migration).toMatch(/return inserted_count = 1/);
  });

  it('binds each successful claim to exact deployment identity metadata', () => {
    expect(migration).toMatch(/repository text not null/);
    expect(migration).toMatch(/head_sha text not null check \(head_sha ~ '\^\[0-9a-f\]\{40\}\$'\)/);
    expect(migration).toMatch(/action_type text not null/);
    expect(migration).toMatch(/consumed_at timestamptz not null/);
  });

  it('accepts the v2 case-insensitive SHA contract but stores canonical lowercase', () => {
    expect(migration).toMatch(/p_head_sha !~\* '\^\[0-9a-f\]\{40\}\$'/);
    expect(migration).toMatch(/normalized_head_sha := lower\(p_head_sha\)/);
    expect(migration).toMatch(/normalized_head_sha,/);
  });

  it('keeps the table closed to browser roles', () => {
    expect(migration).toMatch(/enable row level security/);
    expect(migration).toMatch(/revoke all on table public\.authority_receipt_consumptions from anon/);
    expect(migration).toMatch(/revoke all on table public\.authority_receipt_consumptions from authenticated/);
    expect(migration).toMatch(/grant select, insert on table public\.authority_receipt_consumptions to service_role/);
  });

  it('exposes the claim function only to service_role', () => {
    expect(migration).toMatch(/security definer/);
    expect(migration).toMatch(/set search_path = public, pg_temp/);
    expect(migration).toMatch(/revoke execute on function public\.claim_authority_receipt_consumption\([^)]+\) from anon/);
    expect(migration).toMatch(/revoke execute on function public\.claim_authority_receipt_consumption\([^)]+\) from authenticated/);
    expect(migration).toMatch(/grant execute on function public\.claim_authority_receipt_consumption\([^)]+\) to service_role/);
  });

  it('does not bootstrap-loop by making deploy depend on the new store yet', () => {
    expect(deployWorkflow).not.toContain('claim_authority_receipt_consumption');
    expect(deployWorkflow).not.toContain('authority_receipt_consumptions');
  });
});
