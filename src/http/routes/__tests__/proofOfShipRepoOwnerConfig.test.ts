import { afterEach, describe, expect, it } from 'vitest';
import {
  ProofOfShipReceiptError,
  validateProofOfShipReceipt,
} from '../../../proofOfShip/receipt.js';
import { normalizeSourceRepo } from '../proofOfShipReceipts.js';

function receiptFor(sourceRepo: string) {
  const exactCommitSha = 'b'.repeat(40);
  return {
    receiptId: '8fa23f1e-2844-4c65-a91a-e88bb91ecab4',
    source: 'zapier',
    sourceRepo,
    exactCommitSha,
    idempotencyKey: `${sourceRepo}:${exactCommitSha}`,
    linkedinBaselineRef: 'linkedin-export:2026-08-02..2026-08-08',
    linkedinRisingFloorReady: true,
    linkedinGrowthHypothesis: 'Lead with verified product evidence.',
    linkedin24hGate: 'Check the verified 24 hour threshold.',
    linkedin48hGate: 'Check the verified 48 hour threshold.',
    linkedinNextMutation: 'Change only the next measured variable.',
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
  };
}

describe('proof-of-ship founder repository owner configuration', () => {
  const originalOwners = process.env.FOUNDER_GITHUB_OWNERS;

  afterEach(() => {
    if (originalOwners === undefined) delete process.env.FOUNDER_GITHUB_OWNERS;
    else process.env.FOUNDER_GITHUB_OWNERS = originalOwners;
  });

  it('defaults to the current personal owner and rejects an unconfigured owner', () => {
    delete process.env.FOUNDER_GITHUB_OWNERS;

    expect(normalizeSourceRepo('jussray', 'founder-control-room')).toBe(
      'jussray/founder-control-room',
    );
    expect(() => normalizeSourceRepo('future-org', 'founder-control-room')).toThrowError(
      new ProofOfShipReceiptError('invalid_source_repo'),
    );
  });

  it('supports an explicit overlap window for personal-to-organization migration', () => {
    process.env.FOUNDER_GITHUB_OWNERS = 'jussray, future-org';

    expect(normalizeSourceRepo('jussray', 'founder-control-room')).toBe(
      'jussray/founder-control-room',
    );
    expect(normalizeSourceRepo('future-org', 'founder-control-room')).toBe(
      'future-org/founder-control-room',
    );
    expect(validateProofOfShipReceipt(receiptFor('future-org/founder-control-room'))).toMatchObject({
      sourceRepo: 'future-org/founder-control-room',
      idempotencyKey: `future-org/founder-control-room:${'b'.repeat(40)}`,
    });
  });

  it('fails closed on malformed configured owner values', () => {
    process.env.FOUNDER_GITHUB_OWNERS = 'jussray, not valid';

    expect(() => normalizeSourceRepo('jussray', 'founder-control-room')).toThrowError(
      new ProofOfShipReceiptError('invalid_source_repo'),
    );
  });
});
