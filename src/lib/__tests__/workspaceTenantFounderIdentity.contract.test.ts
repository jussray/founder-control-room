import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260911050000_workspace_tenant_foundation.sql'),
  'utf8',
);

describe('workspace tenancy founder identity boundary', () => {
  it('keeps platform founder authority bound to immutable Supabase Auth user_id', () => {
    expect(migration).toContain("fu.user_id = (select auth.uid())");
    expect(migration).toContain("fu.account_role = 'platform_owner'");
    expect(migration).toContain("auth.role()) = 'authenticated'");
    expect(migration).not.toContain("lower(fu.email) = lower((select auth.jwt()) ->> 'email')");
  });

  it('fails closed when the Supabase auth helpers are unavailable', () => {
    expect(migration).toContain("p.proname = 'uid'");
    expect(migration).toContain("p.proname = 'jwt'");
    expect(migration).toContain("p.proname = 'role'");
    expect(migration).toMatch(/else[\s\S]*create or replace function public\.is_founder\(\)[\s\S]*select false;/i);
  });
});
