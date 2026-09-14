import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

const { supabaseAdmin, from, select, eq, maybeSingle, insert } = vi.hoisted(() => {
  const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
  const eq = vi.fn();
  const select = vi.fn();
  const insert = vi.fn().mockResolvedValue({ error: null });
  const from = vi.fn();
  const supabaseAdmin = vi.fn();

  const query = { select, eq, maybeSingle, insert };
  select.mockReturnValue(query);
  eq.mockReturnValue(query);
  from.mockReturnValue(query);
  supabaseAdmin.mockReturnValue({ from });

  return { supabaseAdmin, from, select, eq, maybeSingle, insert };
});

vi.mock('../../lib/supabase.js', () => ({ supabaseAdmin }));

import { proofOfShipReceiptRepository } from '../../http/routes/proofOfShipReceipts.js';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const migrationsDir = resolve(repositoryRoot, 'supabase/migrations');
const migration = readFileSync(
  resolve(migrationsDir, '20260824210706_harden_proof_of_ship_receipt_role_grants.sql'),
  'utf8',
);

function stripSqlComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--.*$/gm, '');
}

function effectivePublicRoleGrantState(): Record<'anon' | 'authenticated', boolean | null> {
  const state: Record<'anon' | 'authenticated', boolean | null> = {
    anon: null,
    authenticated: null,
  };

  for (const filename of readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()) {
    const sql = stripSqlComments(readFileSync(resolve(migrationsDir, filename), 'utf8'));
    const statements = sql.split(';').map((statement) => statement.trim()).filter(Boolean);

    for (const statement of statements) {
      if (!/\bpublic\.proof_of_ship_receipts\b/i.test(statement)) continue;

      for (const role of ['anon', 'authenticated'] as const) {
        if (!new RegExp(`\\b${role}\\b`, 'i').test(statement)) continue;

        if (/^\s*REVOKE\s+ALL\s+PRIVILEGES\b/i.test(statement)) {
          state[role] = false;
        } else if (/^\s*GRANT\s+/i.test(statement)) {
          state[role] = true;
        }
      }
    }
  }

  return state;
}

const validReceipt = {
  receiptId: '8fa23f1e-2844-4c65-a91a-e88bb91ecab4',
  source: 'zapier',
  sourceRepo: 'jussray/founder-control-room',
  exactCommitSha: 'b'.repeat(40),
  idempotencyKey: `jussray/founder-control-room:${'b'.repeat(40)}`,
  linkedinBaselineRef: 'linkedin-export:2026-08-02..2026-08-08',
  linkedinRisingFloorReady: true,
  linkedinGrowthHypothesis: 'Lead with a concrete execution conflict and verified mechanism.',
  linkedin24hGate: 'At least 150 impressions and 5% engagement rate after 24 hours.',
  linkedin48hGate: 'Beat the verified individual-post floor without engagement falling below 5%.',
  linkedinNextMutation: 'If distribution is weak but engagement holds, change the hook and format, not the proof.',
  linkedinDraftSha256: 'c'.repeat(64),
  bufferTerminalAction: 'schedule',
  bufferScheduleId: 'buffer:scheduled:12345',
  scheduledAt: '2026-08-08T06:40:00.000Z',
  bufferPublicationStatus: 'published',
  bufferPostId: 'buffer:post:12345',
  livePostUrl: 'https://www.linkedin.com/feed/update/urn:li:activity:12345/',
  publishedAt: '2026-08-08T06:41:00.000Z',
  smsNotificationStatus: 'delivered',
  smsProvider: 'twilio',
  smsMessageId: 'SM1234567890abcdef',
  smsDeliveredAt: '2026-08-08T06:41:05.000Z',
  occurredAt: '2026-08-08T06:41:06.000Z',
} as const;

describe('proof-of-ship receipt role grants', () => {
  it('ends the ordered migration ledger with public-role privileges revoked', () => {
    expect(migration).toContain('REVOKE ALL PRIVILEGES');
    expect(effectivePublicRoleGrantState()).toEqual({
      anon: false,
      authenticated: false,
    });
  });

  it('exercises receipt reads and writes through the service-role client', async () => {
    vi.clearAllMocks();

    const query = { select, eq, maybeSingle, insert };
    select.mockReturnValue(query);
    eq.mockReturnValue(query);
    from.mockReturnValue(query);
    supabaseAdmin.mockReturnValue({ from });
    maybeSingle.mockResolvedValue({ data: null, error: null });
    insert.mockResolvedValue({ error: null });

    await expect(proofOfShipReceiptRepository.find(validReceipt.receiptId)).resolves.toBeNull();
    await expect(proofOfShipReceiptRepository.store(validReceipt)).resolves.toBe('stored');

    expect(supabaseAdmin).toHaveBeenCalledTimes(3);
    expect(from).toHaveBeenCalledWith('proof_of_ship_receipts');
    expect(select).toHaveBeenCalled();
    expect(insert).toHaveBeenCalledOnce();
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        receipt_id: validReceipt.receiptId,
        source_repo: validReceipt.sourceRepo,
        exact_commit_sha: validReceipt.exactCommitSha,
      }),
    );
  });
});
