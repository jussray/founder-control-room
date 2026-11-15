import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync('.github/workflows/neon-pr-branches.yml', 'utf8');
const contract = readFileSync('supabase/preview-contracts/20260909033000_friend_intake_privacy_store.sql', 'utf8');

describe('Neon runs the real Supabase Friend migration instead of skipping it', () => {
  it('runs compatibility setup, the actual migration and a post-apply check in order', () => {
    const start = workflow.indexOf('PREVIEW_CONTRACT="supabase/preview-contracts/');
    const end = workflow.indexOf('INSERT INTO ci_preview.migration_receipts(filename, sha256)', start);
    const phase = workflow.slice(start, end);
    const prepare = phase.lastIndexOf('Running migration preview contract: $PREVIEW_CONTRACT');
    const apply = phase.lastIndexOf('Applying preview migration atomically: $migration');
    const verify = phase.lastIndexOf('Verifying applied migration with preview contract: $PREVIEW_CONTRACT');
    expect(start).toBeGreaterThan(0);
    expect(prepare).toBeGreaterThan(0);
    expect(apply).toBeGreaterThan(prepare);
    expect(verify).toBeGreaterThan(apply);
    expect(phase).toContain('psql "$NEON_DB_URL" -X -1 -v ON_ERROR_STOP=1 -f "$migration"');
    expect(phase).not.toMatch(/else\s+echo "Applying preview migration atomically/);
  });

  it('keeps Auth role stubs confined to the Neon compatibility file', () => {
    expect(contract).toContain('CI-ONLY Neon preview compatibility');
    expect(contract).toContain('CREATE SCHEMA IF NOT EXISTS auth;');
    expect(contract).toContain('CREATE ROLE anon NOLOGIN;');
    expect(contract).toContain('CREATE ROLE authenticated NOLOGIN;');
    expect(contract).toContain('CREATE ROLE service_role NOLOGIN;');
    expect(contract).toContain('CREATE OR REPLACE FUNCTION auth.role()');
    expect(contract).not.toMatch(/WITH\s+BYPASSRLS/i);
  });

  it('refuses green when actual Friend tables, RLS or service-only RPCs are missing', () => {
    for (const name of ['friend_intake_summaries','friend_intake_feedback','friend_inference_reservations']) {
      expect(contract).toContain(name);
    }
    expect(contract).toContain('relrowsecurity');
    expect(contract).toContain("has_table_privilege('anon'");
    expect(contract).toContain('reserve_friend_inference_budget');
    expect(contract).toContain('record_friend_intake_completion');
    expect(contract).toContain('has_function_privilege(');
    expect(contract).toContain('RAISE EXCEPTION');
  });
});
