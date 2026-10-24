import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('SYNC Party growth ingestion wiring contract', () => {
  const dashboard = readFileSync('src/http/routes/dashboard.ts', 'utf8');
  const service = readFileSync('src/lib/syncPartyGrowthOutcome.ts', 'utf8');
  const workerConfig = readFileSync('wrangler.worker.toml', 'utf8');
  const docs = readFileSync('docs/SYNC_PARTY_GROWTH_OUTCOME_INGEST.md', 'utf8');

  it('keeps the dashboard observer behind the existing founder authorization membrane', () => {
    expect(dashboard).toContain('dashboardRouter.use(requireFounder);');
    expect(dashboard).toContain("dashboardRouter.get('/sync-party-growth'");
    expect(dashboard).toContain('readSyncPartyGrowthOutcome');
  });

  it('uses a namespaced provider-held credential without hardcoding a secret value', () => {
    expect(service).toContain('SYNC_PARTY_GROWTH_READ_KEY');
    expect(service).toContain("'x-growth-read-key': readKey");
    expect(service).not.toMatch(/SYNC_PARTY_GROWTH_READ_KEY\s*=\s*['\"][^'\"]+['\"]/);
  });

  it('does not turn optional SYNC analytics into a global FCR startup secret dependency', () => {
    expect(workerConfig).not.toContain('SYNC_PARTY_GROWTH_READ_KEY');
    expect(docs).toContain('fail closed at its own boundary');
  });

  it('keeps stable URL and exact runtime identity as separate evidence', () => {
    expect(service).toContain('/api/version');
    expect(service).toContain('RUNTIME_MOVED_DURING_READ');
    expect(docs).toContain('The Workers URL is a locator, not an immutable runtime identity.');
  });

  it('forbids invented retention and revenue semantics', () => {
    expect(service).toContain("returningUsers: 'UNKNOWN'");
    expect(service).toContain("paidConversions: 'UNKNOWN'");
    expect(docs).toContain('`rematch_started` is not a returning user.');
  });
});
