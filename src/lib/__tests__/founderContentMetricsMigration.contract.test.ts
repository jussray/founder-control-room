import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const originalMigration = readFileSync(
  resolve(repositoryRoot, 'supabase/migrations/20260916080500_founder_content_metric_observations.sql'),
  'utf8',
);
const searchPathHardeningMigration = readFileSync(
  resolve(repositoryRoot, 'supabase/migrations/20260919020000_harden_founder_content_metric_function_search_paths.sql'),
  'utf8',
);
const appendOnlyFkHardeningMigration = readFileSync(
  resolve(repositoryRoot, 'supabase/migrations/20260921051000_harden_founder_content_metric_append_only_fk.sql'),
  'utf8',
);

describe('founder content metrics migration contract', () => {
  it('keeps metrics persistence atomic with the metrics_synced lifecycle event', () => {
    expect(originalMigration).toContain('founder_content_metrics_from_lifecycle_event');
    expect(originalMigration).toContain('public.ingest_founder_content_metric_observations(');
    expect(originalMigration).toMatch(/create\s+trigger\s+founder_content_metrics_from_lifecycle_event[\s\S]*after\s+insert/i);
    expect(originalMigration).toMatch(/when\s*\(new\.event_type\s*=\s*'metrics_synced'\)/i);
  });

  it('keeps the observation ledger append-only, including parent deletion', () => {
    expect(originalMigration).toContain('revoke all on table public.founder_content_metric_observations from public, anon, authenticated, service_role');
    expect(originalMigration).toContain('grant select on table public.founder_content_metric_observations to service_role');
    expect(originalMigration).not.toMatch(/grant\s+[^;]*(?:update|delete)[^;]*founder_content_metric_observations/i);
    expect(appendOnlyFkHardeningMigration).toContain('drop constraint if exists founder_content_metric_post_founder_fk');
    expect(appendOnlyFkHardeningMigration).toMatch(/foreign key \(post_id, founder_user_id\)[\s\S]*on delete restrict/i);
    expect(appendOnlyFkHardeningMigration).not.toMatch(/on delete cascade/i);
  });

  it('pins every metrics SECURITY DEFINER function to the system catalog search path', () => {
    const requiredSignatures = [
      'alter function public.ingest_founder_content_metric_observations(text, uuid, jsonb, timestamptz)',
      'alter function public.ingest_founder_content_metrics_from_lifecycle_event()',
      'alter function public.import_founder_content_metric_observations(text, uuid, jsonb, text, timestamptz)',
    ];

    for (const signature of requiredSignatures) {
      const start = searchPathHardeningMigration.indexOf(signature);
      expect(start).toBeGreaterThanOrEqual(0);
      const statementEnd = searchPathHardeningMigration.indexOf(';', start);
      const statement = searchPathHardeningMigration.slice(start, statementEnd + 1);
      expect(statement).toContain('set search_path = pg_catalog');
    }
  });
});
