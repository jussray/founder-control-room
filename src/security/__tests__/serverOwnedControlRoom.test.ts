import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const founderMigration = readFileSync(
  `${root}supabase/migrations/20260713034026_harden_founder_helper_server_only.sql`,
  'utf8',
);
const policyMigration = readFileSync(
  `${root}supabase/migrations/20260713034038_scope_control_room_policy_roles.sql`,
  'utf8',
);
const grantMigration = readFileSync(
  `${root}supabase/migrations/20260713034048_remove_control_room_client_table_grants.sql`,
  'utf8',
);
const probe = readFileSync(
  `${root}supabase/probes/server_owned_control_room_phase1.sql`,
  'utf8',
);

describe('server-owned Control Room database boundary', () => {
  it('rejects anonymous founder claims and fixes the function search path', () => {
    expect(founderMigration).toMatch(/create or replace function public\.is_founder\(\)/i);
    expect(founderMigration).toMatch(/set search_path = public, auth/i);
    expect(founderMigration).toMatch(/is_anonymous/i);
    expect(founderMigration).toMatch(/auth\.role\(\).*authenticated/is);
  });

  it('removes browser execution of the founder helper', () => {
    expect(founderMigration).toMatch(
      /revoke all on function public\.is_founder\(\) from public, anon, authenticated;/i,
    );
    expect(founderMigration).toMatch(
      /grant execute on function public\.is_founder\(\) to service_role;/i,
    );
  });

  it('revokes client table grants and preserves service-role access', () => {
    expect(grantMigration).toMatch(
      /revoke all privileges on table %I\.%I from public, anon, authenticated/i,
    );
    expect(grantMigration).toMatch(
      /grant all privileges on table %I\.%I to service_role/i,
    );
  });

  it('retargets retained policies away from PUBLIC', () => {
    expect(policyMigration).toMatch(/alter policy %I on %I\.%I to authenticated/i);
    expect(policyMigration).toMatch(/alter policy %I on %I\.%I to service_role/i);
  });

  it('ships a read-only rollback-contained catalog probe', () => {
    expect(probe).toMatch(/^-- Founder Control Room server-owned boundary proof/m);
    expect(probe).toMatch(/\bbegin;/i);
    expect(probe).toMatch(/\brollback;\s*$/i);
    expect(probe).not.toMatch(/\bcommit;/i);
    expect(probe).not.toMatch(/^\s*(insert|update|delete)\s+into\s+public\./im);
    expect(probe).toContain('all_public_tables_deny_client_privileges');
    expect(probe).toContain('service_role_keeps_table_access');
    expect(probe).toContain('policies_do_not_target_public');
    expect(probe).toContain('founder_helper_is_internal');
    expect(probe).toContain('founder_helper_rejects_anonymous_claims');
  });
});
