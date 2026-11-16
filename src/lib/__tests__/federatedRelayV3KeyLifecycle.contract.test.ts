import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const tablePath = resolve(repositoryRoot, 'supabase/migrations/20260913180000_federated_relay_v3.sql');
const guardPath = resolve(
  repositoryRoot,
  'supabase/migrations/20261115194101_guard_federated_relay_v3_public_key_immutability.sql',
);
const grantsPath = resolve(
  repositoryRoot,
  'supabase/migrations/20261116053000_restrict_federated_relay_public_keys_service_role_update_columns.sql',
);
const table = readFileSync(tablePath, 'utf8').toLowerCase();
const guard = readFileSync(guardPath, 'utf8').toLowerCase();
const grants = readFileSync(grantsPath, 'utf8')
  .toLowerCase()
  .split('\n')
  .filter((line) => !line.trim().startsWith('--'))
  .join('\n');

const immutableColumns = ['member', 'key_id', 'algorithm', 'public_key_jwk', 'valid_from', 'created_at'];

describe('federated relay v3 public-key immutability guard', () => {
  it('references columns that exist on the relay public-key table', () => {
    expect(table).toContain('create table if not exists public.federated_relay_public_keys');
    for (const column of [...immutableColumns, 'state', 'valid_until', 'revoked_at', 'updated_at']) {
      expect(table).toMatch(new RegExp(`\\n\\s+${column}\\s`));
    }
  });

  it('rejects in-place changes to key identity or key material', () => {
    for (const column of immutableColumns) {
      expect(guard).toContain(`new.${column} is distinct from old.${column}`);
    }
    expect(guard).toContain("raise exception 'relay_key_identity_or_material_immutable'");
  });

  it('keeps lifecycle transitions possible but monotonic with database-owned timestamps', () => {
    expect(guard).toContain("old.state = 'revoked' and new.state <> 'revoked'");
    expect(guard).toContain("old.state = 'retired' and new.state = 'active'");
    expect(guard).toContain('old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at');
    expect(guard).toContain('old.valid_until is not null and new.valid_until is distinct from old.valid_until');
    expect(guard).toContain('new.valid_until <= clock_timestamp()');
    expect(guard).toContain('new.revoked_at := clock_timestamp();');
    expect(guard).toContain('new.updated_at := clock_timestamp();');
    expect(guard).not.toMatch(/new\.state\s+is\s+distinct\s+from\s+old\.state/);
  });

  it('installs a row-level before-update guard without exposing the function or changing table grants', () => {
    expect(guard).toContain('set search_path = pg_catalog, public');
    expect(guard).not.toContain('security definer');
    expect(guard).toContain('create trigger federated_relay_public_keys_lifecycle_guard_v3');
    expect(guard).toContain('before update on public.federated_relay_public_keys');
    expect(guard).toContain('for each row execute function public.guard_federated_relay_public_key_lifecycle_v3();');
    expect(guard).toContain('revoke all on function public.guard_federated_relay_public_key_lifecycle_v3()');
    expect(guard).toContain('from public, anon, authenticated, service_role;');
    expect(guard).not.toMatch(/\bon table\b/);
  });

  it('limits service_role UPDATE to the lifecycle columns without touching SELECT or INSERT', () => {
    expect(grants).toContain('revoke update on table public.federated_relay_public_keys from service_role;');
    expect(grants).toMatch(
      /grant update \(state, valid_until\)\s+on table public\.federated_relay_public_keys\s+to service_role;/,
    );
    for (const column of [...immutableColumns, 'revoked_at', 'updated_at']) {
      expect(grants).not.toMatch(new RegExp(`grant update \\([^)]*\\b${column}\\b`));
    }
    expect(grants).not.toMatch(/\b(revoke|grant)\s+(all|select|insert|delete)\b/);
    expect(grants).not.toMatch(/\b(anon|authenticated)\b/);
  });
});
