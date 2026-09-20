import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260920163000_reject_raw_connection_credentials.sql'),
  'utf8',
);

describe('project connection non-secret config boundary', () => {
  it('recursively rejects credential-shaped keys and values', () => {
    expect(migration).toContain('jsonb_each(p_value)');
    expect(migration).toContain('jsonb_array_elements(p_value)');
    expect(migration).toContain('client[_-]?secret');
    expect(migration).toContain('service[_-]?role');
    expect(migration).toContain('github_pat_');
    expect(migration).toContain('Bearer[[:space:]]+');
  });

  it('fails migration when existing connection config still requires secret remediation', () => {
    expect(migration).toContain('existing_project_connection_config_requires_secret_remediation');
    expect(migration).not.toContain('raise notice');
  });

  it('enforces the guard on both insert and config update', () => {
    expect(migration).toContain('before insert or update of config on public.project_connections');
  });
});
