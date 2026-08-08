import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(
  new URL('../../../.github/workflows/proof-of-ship-downstream-receipt.yml', import.meta.url),
  'utf8',
);
const server = readFileSync(new URL('../../http/server.ts', import.meta.url), 'utf8');
const migration = readFileSync(
  new URL('../../../supabase/migrations/20260808061500_proof_of_ship_receipts.sql', import.meta.url),
  'utf8',
);

describe('proof-of-ship downstream receipt workflow contract', () => {
  it('runs only after Deploy completion or an explicit exact-SHA replay', () => {
    expect(workflow).toMatch(/name: Proof-of-Ship Downstream Receipt/);
    expect(workflow).toMatch(/workflow_run:\s*\n\s*workflows: \["Deploy"\]/);
    expect(workflow).toMatch(/workflow_dispatch:/);
    expect(workflow).toMatch(/expected_sha:/);
    expect(workflow).toMatch(/github\.event\.workflow_run\.conclusion == 'success'/);
  });

  it('binds lookup to the exact deployed commit and checked-in LinkedIn baseline', () => {
    expect(workflow).toMatch(/EXPECTED_SHA:/);
    expect(workflow).toMatch(/test "\$\(git rev-parse HEAD\)" = "\$EXPECTED_SHA"/);
    expect(workflow).toMatch(/config\/linkedin-rising-floor-baseline\.json/);
    expect(workflow).toMatch(/idempotency_key="\$\{GITHUB_REPOSITORY\}:\$\{EXPECTED_SHA\}"/);
    expect(workflow).toMatch(/proof-of-ship-receipts\/by-commit\/jussray\/\$repo_name\/\$EXPECTED_SHA/);
  });

  it('uses a private receipt token and a bounded polling window', () => {
    expect(workflow).toMatch(/PROOF_OF_SHIP_RECEIPT_TOKEN: \$\{\{ secrets\.PROOF_OF_SHIP_RECEIPT_TOKEN \}\}/);
    expect(workflow).toMatch(/x-proof-of-ship-receipt-token: \$PROOF_OF_SHIP_RECEIPT_TOKEN/);
    expect(workflow).toMatch(/RECEIPT_LOOKUP_ATTEMPTS: '30'/);
    expect(workflow).toMatch(/RECEIPT_LOOKUP_DELAY_SECONDS: '10'/);
    expect(workflow).toMatch(/"\$attempts" -gt 60/);
    expect(workflow).toMatch(/"\$delay" -gt 30/);
    expect(workflow).toMatch(/"\$status" == 404/);
    expect(workflow).toMatch(/Downstream completion unproven/);
  });

  it('rejects a 200 response unless all rising-floor and Buffer proof fields match', () => {
    for (const required of [
      '.receipt.source == "zapier"',
      '.receipt.sourceRepo == $repo',
      '.receipt.exactCommitSha == $sha',
      '.receipt.idempotencyKey == $key',
      '.receipt.linkedinBaselineRef == $baseline',
      '.receipt.linkedinRisingFloorReady == true',
      '.receipt.linkedinGrowthHypothesis',
      '.receipt.linkedin24hGate',
      '.receipt.linkedin48hGate',
      '.receipt.linkedinNextMutation',
      '.receipt.linkedinDraftSha256',
      '.receipt.bufferTerminalAction == "schedule"',
      '.receipt.bufferScheduleId',
      '.receipt.scheduledAt',
      '.receipt.occurredAt',
    ]) {
      expect(workflow).toContain(required);
    }
  });

  it('mounts authenticated exact-commit lookup before the generic receipt-id route', () => {
    const exactLookup = server.indexOf('/ingest/proof-of-ship-receipts/by-commit/:owner/:repo/:sha');
    const receiptLookup = server.indexOf("'/ingest/proof-of-ship-receipts/:receiptId'");
    expect(exactLookup).toBeGreaterThan(-1);
    expect(receiptLookup).toBeGreaterThan(-1);
    expect(exactLookup).toBeLessThan(receiptLookup);
    expect(server).toContain('handleProofOfShipCommitLookup');
  });

  it('keeps the receipt ledger service-role only and content-free', () => {
    expect(migration).toMatch(/ALTER TABLE public\.proof_of_ship_receipts ENABLE ROW LEVEL SECURITY;/);
    expect(migration).not.toMatch(/CREATE POLICY/i);
    expect(migration).not.toMatch(/linkedin_draft\s+TEXT/i);
    expect(migration).toMatch(/linkedin_draft_sha256 TEXT NOT NULL/);
    expect(migration).toMatch(/CHECK \(idempotency_key = source_repo \|\| ':' \|\| exact_commit_sha\)/);
  });
});
