import { describe, expect, it } from 'vitest';
import { ProofOfShipReceiptError, validateProofOfShipReceipt } from '../receipt.js';

const receipt = {
  receiptId: '8fa23f1e-2844-4c65-a91a-e88bb91ecab4',
  source: 'zapier',
  sourceRepo: 'jussray/founder-control-room',
  exactCommitSha: 'b'.repeat(40),
  idempotencyKey: `jussray/founder-control-room:${'b'.repeat(40)}`,
  linkedinBaselineRef: 'linkedin-export:2026-08-02..2026-08-08',
  linkedinRisingFloorReady: true,
  linkedinGrowthHypothesis: 'Use verified accomplishment proof and improve the hook.',
  linkedin24hGate: 'Measure distribution and engagement after 24 hours.',
  linkedin48hGate: 'Compare against the previous verified floor after 48 hours.',
  linkedinNextMutation: 'Change the weakest-performing variable for the next post.',
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

function expectInvalidLivePostUrl(livePostUrl: string) {
  try {
    validateProofOfShipReceipt({ ...receipt, livePostUrl });
    throw new Error('expected validation to fail');
  } catch (error) {
    expect(error).toBeInstanceOf(ProofOfShipReceiptError);
    expect((error as ProofOfShipReceiptError).code).toBe('invalid_live_post_url');
  }
}

describe('proof-of-ship live publication platform', () => {
  it('accepts a canonical LinkedIn live-post URL', () => {
    expect(validateProofOfShipReceipt(receipt).livePostUrl).toBe(receipt.livePostUrl);
  });

  it('rejects an X-only receipt as canonical LinkedIn completion proof', () => {
    expectInvalidLivePostUrl('https://x.com/jussray/status/12345');
  });

  it('rejects a generic LinkedIn page that is not a post route', () => {
    expectInvalidLivePostUrl('https://www.linkedin.com/');
    expectInvalidLivePostUrl('https://www.linkedin.com/in/example/');
  });

  it('accepts LinkedIn posts routes as canonical completion proof', () => {
    const postsReceipt = validateProofOfShipReceipt({
      ...receipt,
      livePostUrl: 'https://www.linkedin.com/posts/example_verified-build-activity-12345-abcd/',
    });
    expect(postsReceipt.livePostUrl).toContain('/posts/');
  });
});
