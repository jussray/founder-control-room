import { beforeEach, describe, expect, it } from 'vitest';
import type { DeterministicFriendIntakeResult } from '../../../chief/firstSliceEngine.js';
import {
  issueSensitiveSaveReviewReceipt,
  reviewReceiptDerivedUuid,
  verifySensitiveSaveReviewReceipt,
  type SensitiveSaveReviewBinding,
} from '../friendIntakeReviewReceipt.js';

const FOUNDER_ID = '00000000-0000-4000-8000-000000000111';
const OTHER_FOUNDER_ID = '00000000-0000-4000-8000-000000000222';
const SESSION_ID_HASH = 'a'.repeat(64);
const OTHER_SESSION_ID_HASH = 'b'.repeat(64);
const RAW_TEXT = 'Sensitive founder context for review.';
const NOW = 1_788_992_000;
const REVIEW_KEY = Buffer.alloc(32, 7).toString('base64url');

const RESULT: DeterministicFriendIntakeResult = {
  mirror: {
    headline: 'This needs a protected next step.',
    summary: 'You shared a sensitive legal situation. The first step is to protect context before taking action.',
  },
  intentTags: ['legal'],
  move: {
    kind: 'protective_move',
    text: 'Protect this context for now.',
    timeEstimateMinutes: 5,
    gateWarning: 'Sensitive input stays in a protective lane and does not trigger an external action.',
    policy: 'protective',
  },
  sensitiveCategories: ['legal'],
  redactedSummary: 'You shared a sensitive legal situation. The first step is to protect context before taking action.',
};

function binding(overrides: Partial<SensitiveSaveReviewBinding> = {}): SensitiveSaveReviewBinding {
  return {
    founderId: FOUNDER_ID,
    browserSessionIdHash: SESSION_ID_HASH,
    rawText: RAW_TEXT,
    result: RESULT,
    engineVersion: 'first-slice-v1',
    moveGateWarningCode: 'sensitive_protective',
    ...overrides,
  };
}

beforeEach(() => {
  process.env.FOUNDER_SESSION_ENCRYPTION_KEY = REVIEW_KEY;
});

describe('Friend Intake sensitive-save review receipt', () => {
  it('verifies only for the founder, browser session, and exact reviewed input it was issued for', () => {
    const reviewed = binding();
    const token = issueSensitiveSaveReviewReceipt(reviewed, NOW);

    expect(verifySensitiveSaveReviewReceipt(token, reviewed, NOW)).toBe(true);
    expect(verifySensitiveSaveReviewReceipt(token, binding({ founderId: OTHER_FOUNDER_ID }), NOW)).toBe(false);
    expect(verifySensitiveSaveReviewReceipt(token, binding({ browserSessionIdHash: OTHER_SESSION_ID_HASH }), NOW)).toBe(false);
    expect(verifySensitiveSaveReviewReceipt(token, binding({ rawText: `${RAW_TEXT} changed` }), NOW)).toBe(false);
    expect(token).not.toContain(RAW_TEXT);
    expect(token).not.toContain(RESULT.redactedSummary ?? '');
  });

  it('binds every persisted sensitive-review label into the receipt', () => {
    const token = issueSensitiveSaveReviewReceipt(binding(), NOW);
    const changedIntentTags = { ...RESULT, intentTags: ['general'] as DeterministicFriendIntakeResult['intentTags'] };
    const changedCategories = { ...RESULT, sensitiveCategories: ['health'] as DeterministicFriendIntakeResult['sensitiveCategories'] };

    expect(verifySensitiveSaveReviewReceipt(token, binding({ result: changedIntentTags }), NOW)).toBe(false);
    expect(verifySensitiveSaveReviewReceipt(token, binding({ result: changedCategories }), NOW)).toBe(false);
  });

  it('binds every persisted move field and engine version into the review receipt', () => {
    const token = issueSensitiveSaveReviewReceipt(binding(), NOW);
    const changedKind = { ...RESULT, move: { ...RESULT.move, kind: 'clarifying_question' as const } };
    const changedPolicy = { ...RESULT, move: { ...RESULT.move, policy: 'clarifying' as const } };
    const changedDuration = { ...RESULT, move: { ...RESULT.move, timeEstimateMinutes: 10 } };

    expect(verifySensitiveSaveReviewReceipt(token, binding({ result: changedKind }), NOW)).toBe(false);
    expect(verifySensitiveSaveReviewReceipt(token, binding({ result: changedPolicy }), NOW)).toBe(false);
    expect(verifySensitiveSaveReviewReceipt(token, binding({ result: changedDuration }), NOW)).toBe(false);
    expect(verifySensitiveSaveReviewReceipt(token, binding({ moveGateWarningCode: 'sensitive_clarifying' }), NOW)).toBe(false);
    expect(verifySensitiveSaveReviewReceipt(token, binding({ engineVersion: 'first-slice-v2' }), NOW)).toBe(false);
  });

  it('derives stable, purpose-separated database identities so one receipt cannot create two sensitive saves', () => {
    const token = issueSensitiveSaveReviewReceipt(binding(), NOW);
    const intakeId = reviewReceiptDerivedUuid(token, 'intake');
    const timelineId = reviewReceiptDerivedUuid(token, 'timeline');

    expect(intakeId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(timelineId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(reviewReceiptDerivedUuid(token, 'intake')).toBe(intakeId);
    expect(timelineId).not.toBe(intakeId);
  });

  it('expires after the five-minute review window and rejects malformed receipts', () => {
    const reviewed = binding();
    const token = issueSensitiveSaveReviewReceipt(reviewed, NOW);

    expect(verifySensitiveSaveReviewReceipt(token, reviewed, NOW + 300)).toBe(true);
    expect(verifySensitiveSaveReviewReceipt(token, reviewed, NOW + 301)).toBe(false);
    expect(verifySensitiveSaveReviewReceipt('v2.invalid.receipt', reviewed, NOW)).toBe(false);
  });
});
