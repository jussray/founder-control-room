import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const authorityMigration = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260921010500_preserve_non_anonymous_founder_authority.sql',
  ),
  'utf8',
);

describe('workspace tenancy founder identity boundary', () => {
  it('keeps platform founder authority bound to immutable non-anonymous Supabase Auth identity', () => {
    expect(authorityMigration).toContain("fu.user_id = (select auth.uid())");
    expect(authorityMigration).toContain("fu.account_role = 'platform_owner'");
    expect(authorityMigration).toContain("auth.role()) = 'authenticated'");
    expect(authorityMigration).toContain("auth.jwt()) ->> 'is_anonymous'");
    expect(authorityMigration).not.toContain("lower(fu.email) = lower((select auth.jwt()) ->> 'email')");
  });

  it('fails closed when the Supabase auth helpers are unavailable', () => {
    expect(authorityMigration).toContain("p.proname = 'uid'");
    expect(authorityMigration).toContain("p.proname = 'jwt'");
    expect(authorityMigration).toContain("p.proname = 'role'");
    expect(authorityMigration).toMatch(
      /else[\s\S]*create or replace function public\.is_founder\(\)[\s\S]*select false;/i,
    );
  });
});
