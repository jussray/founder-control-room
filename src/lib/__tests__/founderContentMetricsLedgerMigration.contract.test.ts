import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const migration = readFileSync(
  resolve(repositoryRoot, 'supabase/migrations/20261024060000_founder_content_metric_observation_ledger.sql'),
  'utf8',
);

describe('founder content metric observation ledger migration', () => {
  it('is a real SQL file rather than an escaped text artifact', () => {
    expect(migration).not.toContain('\\\\n');
    expect(migration).toContain('begin;');
    expect(migration).toContain('commit;');
  });

  it('keeps observations append-only and post deletion restrictive', () => {
    expect(migration).toContain('revoke all on table public.founder_content_metric_observations');
    expect(migration).toContain('grant select on table public.founder_content_metric_observations to service_role');
    expect(migration).not.toMatch(/grant\s+[^;]*(?:insert|update|delete)[^;]*founder_content_metric_observations/i);
    expect(migration).toMatch(/foreign key \(post_id, founder_user_id\)[\s\S]*on delete restrict/i);
  });

  it('fails closed on empty envelopes and canonicalizes founder identity', () => {
    expect(migration).toContain("jsonb_array_length(p_envelope->'observations') = 0");
    expect(migration).toContain('v_founder_user_id := pg_catalog.btrim(p_founder_user_id)');
    expect(migration).toContain('p.founder_user_id = v_founder_user_id');
  });

  it('recomputes database hashes instead of trusting caller fingerprints', () => {
    expect(migration).toContain('public.founder_content_metric_canonical_jsonb');
    expect(migration).toContain('order by key collate "C"');
    expect(migration).toContain('extensions.digest(');
    expect(migration).toContain('v_source_row_hash := encode');
    expect(migration).toContain('v_idempotency_key := encode');
  });

  it('pins SECURITY DEFINER functions and bounds provenance at the database boundary', () => {
    expect(migration).toContain('set search_path = pg_catalog');
    expect(migration).toContain('pg_catalog.count(*) <= 40');
    expect(migration).toContain("provenance_entry.key !~ '^[a-zA-Z0-9_.:-]+$'");
    expect(migration).toContain('pg_catalog.octet_length(p_provenance::text) <= 32768');
  });

  it('atomically persists valid metrics_synced events and separately audits historical imports', () => {
    expect(migration).toMatch(/create\s+trigger\s+founder_content_metrics_from_lifecycle_event[\s\S]*after insert/i);
    expect(migration).toMatch(/when \(new\.event_type = 'metrics_synced'\)/i);
    expect(migration).toContain('public.founder_content_metric_import_receipts');
    expect(migration).toContain("'metrics_imported'");
    expect(migration).toContain('application_import_fingerprint');
    expect(migration).toContain('database_envelope_sha256');
  });
});
