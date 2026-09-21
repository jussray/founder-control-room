import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const hardeningMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260921005000_harden_workspace_founder_identity.sql'),
  'utf8',
);

describe('workspace tenancy founder identity boundary', () => {
  it('keeps platform founder authority bound to immutable Supabase Auth user_id', () => {
    expect(hardeningMigration).toContain("fu.user_id = (select auth.uid())");
    expect(hardeningMigration).toContain("fu.account_role = 'platform_owner'");
    expect(hardeningMigration).toContain("auth.role()) = 'authenticated'");
    expect(hardeningMigration).not.toContain("lower(fu.email) = lower((select auth.jwt()) ->> 'email')");
  });

  it('fails closed when the Supabase auth helpers are unavailable', () => {
    expect(hardeningMigration).toContain("p.proname = 'uid'");
    expect(hardeningMigration).toContain("p.proname = 'jwt'");
    expect(hardeningMigration).toContain("p.proname = 'role'");
    expect(hardeningMigration).toMatch(
      /else[\s\S]*create or replace function public\.is_founder\(\)[\s\S]*select false;/i,
    );
  });
});
