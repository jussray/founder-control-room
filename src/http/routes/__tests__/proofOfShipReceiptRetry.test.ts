import { describe, expect, it } from 'vitest';
import { classifyProofOfShipReceiptCollision } from '../proofOfShipReceipts.js';

const receipt = {
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

describe('proof-of-ship receipt retry idempotency', () => {
  it('classifies an exact receipt-id replay as a duplicate', () => {
    expect(classifyProofOfShipReceiptCollision(receipt, receipt, null)).toBe('duplicate');
  });

  it('classifies a regenerated receipt UUID with identical repo+SHA proof as a duplicate', () => {
    const retried = {
      ...receipt,
      receiptId: '3cc96ef1-d60a-46e4-b379-42d3b56e23e6',
    } as const;

    expect(classifyProofOfShipReceiptCollision(retried, null, receipt)).toBe('duplicate');
  });

  it('rejects mutation when the same repo+SHA idempotency identity is reused', () => {
    const mutated = {
      ...receipt,
      receiptId: '3cc96ef1-d60a-46e4-b379-42d3b56e23e6',
      bufferPostId: 'buffer:post:different',
    } as const;

    expect(classifyProofOfShipReceiptCollision(mutated, null, receipt)).toBe('conflict');
  });

  it('rejects receipt-id reuse with different immutable proof', () => {
    const mutated = {
      ...receipt,
      smsMessageId: 'SMdifferent',
    } as const;

    expect(classifyProofOfShipReceiptCollision(mutated, receipt, null)).toBe('conflict');
  });

  it('returns null when no collision exists', () => {
    expect(classifyProofOfShipReceiptCollision(receipt, null, null)).toBeNull();
  });
});
