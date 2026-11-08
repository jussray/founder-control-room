import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql = readFileSync(new URL(
  '../supabase/preview-contracts/20261107164425_fcr_public_tenant_boundaries.sql',
  import.meta.url,
), 'utf8');

test('Neon preview rebuilds only safe Supabase role and auth-user prerequisites', () => {
  assert.match(sql, /CREATE SCHEMA IF NOT EXISTS auth/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS auth\.users/i);
  for (const role of ['anon','authenticated','service_role']) {
    assert.match(sql, new RegExp('CREATE ROLE ' + role + ' NOLOGIN', 'i'));
  }
  assert.match(sql, /\\ir \.\.\/migrations\/20261107164425_fcr_public_tenant_boundaries\.sql/i);
});

test('Neon preview executes the actual migration but rolls back all fixtures', () => {
  assert.match(sql, /\bBEGIN;/i);
  assert.match(sql, /\bROLLBACK;/i);
  assert.doesNotMatch(sql, /\bCOMMIT;/i);
  for (const name of ['fcr_public_tenants','fcr_public_memberships','fcr_public_projects']) {
    assert.match(sql, new RegExp("'" + name + "'", 'i'));
  }
  assert.match(sql, /FOREACH rel_name IN ARRAY/i);
  assert.match(sql, /format\('public\.%I', rel_name\)/i);
});

test('preview checks RLS and denies client privileges instead of fake-pass mocks', () => {
  assert.match(sql, /relrowsecurity/i);
  assert.match(sql, /has_table_privilege/i);
  assert.match(sql, /authenticated/i);
  assert.match(sql, /anon/i);
  assert.match(sql, /service_role/i);
  assert.match(sql, /count\(\*\)/i);
});
