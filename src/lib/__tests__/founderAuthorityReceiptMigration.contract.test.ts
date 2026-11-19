import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(fileURLToPath(new URL(
  '../../../supabase/migrations/20261001212500_founder_authority_receipts.sql',
  import.meta.url,
)), 'utf8');

describe('canonical founder authority receipt migration', () => {
  it('keeps founder decisions and execution authority in separate durable tables', () => {
    expect(sql).toContain('create table if not exists public.founder_authority_receipts');
    expect(sql).toContain("to_regclass('public.founder_permission_requests') is not null");
    expect(sql).toContain('founder_authority_receipts_permission_request_fk');
    expect(sql).toContain('references public.founder_permission_requests(request_id)');
    expect(sql).toContain("action_type in ('merge', 'deploy')");
    expect(sql).toContain("environment = 'production'");
    expect(sql).toContain("receipt_id ~ '^far:[0-9a-f]{48}$'");
  });

  it('preserves the canonical broker FK while tolerating a preview baseline that lacks the broker table', () => {
    expect(sql).toContain("if to_regclass('public.founder_permission_requests') is not null");
    expect(sql).toContain('foreign key (permission_request_id)');
    expect(sql).toContain('on delete restrict');
    expect(sql).toContain('Production Supabase has those');
  });

  it('keeps the canonical receipt service-role-only without requiring Supabase roles in Neon preview', () => {
    expect(sql).toContain('alter table public.founder_authority_receipts enable row level security');
    expect(sql).toContain('revoke all on table public.founder_authority_receipts from public');
    expect(sql).toContain("if to_regrole('anon') is not null");
    expect(sql).toContain("if to_regrole('authenticated') is not null");
    expect(sql).toContain("if to_regrole('service_role') is not null");
    expect(sql).toContain('revoke all on table public.founder_authority_receipts from anon');
    expect(sql).toContain('revoke all on table public.founder_authority_receipts from authenticated');
    expect(sql).toContain('grant select, insert, update, delete on table public.founder_authority_receipts to service_role');
    expect(sql).toContain('grant execute on function public.reserve_founder_authority_receipt');
    expect(sql).toContain('to service_role');
  });

  it('reserves exact action scope atomically before external mutation', () => {
    expect(sql).toContain('create or replace function public.reserve_founder_authority_receipt');
    expect(sql).toContain('security definer');
    expect(sql).toContain('for update');
    expect(sql).toContain('FOUNDER_AUTHORITY_RECEIPT_SCOPE_MISMATCH');
    expect(sql).toContain('FOUNDER_AUTHORITY_RECEIPT_ALREADY_RESERVED');
    expect(sql).toContain("set status = 'reserved'");
    expect(sql).toContain('reserved_by = coalesce(reserved_by, p_execution_key)');
    expect(sql).toContain('revoke all on function public.reserve_founder_authority_receipt');
    expect(sql).toContain('from public');
  });

  it('does not relabel D1 or an external provider as canonical founder authority', () => {
    expect(sql).not.toMatch(/\bd1\b/i);
    expect(sql).not.toMatch(/cloudflare[_ -]?approval/i);
    expect(sql).toContain('Broker decisions alone remain non-authorizing.');
  });
});
