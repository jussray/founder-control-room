import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const migrationUrl = new URL(
  '../../../supabase/migrations/20260815060000_founder_switchboard.sql',
  import.meta.url,
);

async function migration() {
  return (await readFile(migrationUrl, 'utf8')).toLowerCase();
}

describe('founder switchboard migration contract', () => {
  it('keeps both state and evidence tables server-only behind RLS', async () => {
    const sql = await migration();
    expect(sql).toContain('alter table public.founder_switch_overrides enable row level security');
    expect(sql).toContain('alter table public.founder_switch_events enable row level security');
    expect(sql).toContain('revoke all on table public.founder_switch_overrides from public, anon, authenticated');
    expect(sql).toContain('revoke all on table public.founder_switch_events from public, anon, authenticated');
    expect(sql).toContain('to service_role');
  });

  it('uses one hardened atomic function for state plus receipt', async () => {
    const sql = await migration();
    expect(sql).toContain('create or replace function public.set_founder_switch_state');
    expect(sql).toContain('security definer');
    expect(sql).toContain('set search_path = pg_catalog, pg_temp');
    expect(sql).toContain('pg_advisory_xact_lock');
    expect(sql).toContain('insert into public.founder_switch_overrides');
    expect(sql).toContain('insert into public.founder_switch_events');
    expect(sql).toContain('raise exception \'stale switch state\'');
  });

  it('does not grant the mutation RPC to browser roles', async () => {
    const sql = await migration();
    expect(sql).toMatch(/revoke all on function public\.set_founder_switch_state\([\s\S]*?from public, anon, authenticated/);
    expect(sql).toMatch(/grant execute on function public\.set_founder_switch_state\([\s\S]*?to service_role/);
  });
});
