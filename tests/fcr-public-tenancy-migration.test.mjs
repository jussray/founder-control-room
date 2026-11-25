import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const sql = readFileSync(
  new URL('../supabase/migrations/20261107164425_fcr_public_tenant_boundaries.sql', import.meta.url),
  'utf8',
).toLowerCase();

test('all public customer tables are new and separate from founder governance', () => {
  for (const table of ['fcr_public_tenants','fcr_public_memberships','fcr_public_projects']) {
    assert.match(sql, new RegExp('create table public\\.' + table + '\\s*\\('));
    assert.match(sql, new RegExp('alter table public\\.' + table + ' enable row level security'));
    assert.match(sql, new RegExp('revoke all on table public\\.' + table + ' from public, anon, authenticated'));
    assert.match(sql, new RegExp('grant select, insert, update, delete on table public\\.' + table + ' to service_role'));
  }
  assert.doesNotMatch(sql, /create table public\.projects\s*\(/);
  assert.doesNotMatch(sql, /insert\s+into\s+public\.fcr_public_/);
});

test('tenant authorization is immutable, constrained and explicitly empty by default', () => {
  assert.match(sql, /user_id uuid not null references auth\.users\(id\)/);
  assert.match(sql, /primary key \(tenant_id, user_id\)/);
  assert.match(sql, /status in \('active', 'revoked'\)/);
  assert.match(sql, /on public\.fcr_public_projects\(tenant_id\)/);
  assert.doesNotMatch(sql, /grant\s+(select|insert|update|delete).*?to authenticated/);
});

test('migration is rollback-safe when executed inside the isolated Neon preview', () => {
  assert.match(sql.trimStart(), /^--/);
  // Explicit COMMIT would escape the preview contract's enclosing rollback.
  assert.doesNotMatch(sql, /^\s*begin\s*;/mi);
  assert.doesNotMatch(sql, /^\s*commit\s*;/mi);
  assert.doesNotMatch(sql, /\bto authenticated\s+using\s*\(/);
});
