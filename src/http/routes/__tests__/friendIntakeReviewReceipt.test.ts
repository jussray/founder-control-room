import { beforeEach, describe, expect, it } from 'vitest';
import type { DeterministicFriendIntakeResult } from '../../../chief/firstSliceEngine.js';
import {
  issueSensitiveSaveReviewReceipt,
  verifySensitiveSaveReviewReceipt,
} from '../friendIntakeReviewReceipt.js';

const FOUNDER_ID = '00000000-0000-4000-8000-000000000111';
const OTHER_FOUNDER_ID = '00000000-0000-4000-8000-000000000222';
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

beforeEach(() => {
  process.env.FOUNDER_SESSION_ENCRYPTION_KEY = REVIEW_KEY;
});

describe('Friend Intake sensitive-save review receipt', () => {
  it('verifies only for the founder and exact reviewed input it was issued for', () => {
    const token = issueSensitiveSaveReviewReceipt(FOUNDER_ID, RAW_TEXT, RESULT, NOW);

    expect(verifySensitiveSaveReviewReceipt(token, FOUNDER_ID, RAW_TEXT, RESULT, NOW)).toBe(true);
    expect(verifySensitiveSaveReviewReceipt(token, OTHER_FOUNDER_ID, RAW_TEXT, RESULT, NOW)).toBe(false);
    expect(verifySensitiveSaveReviewReceipt(token, FOUNDER_ID, `${RAW_TEXT} changed`, RESULT, NOW)).toBe(false);
    expect(token).not.toContain(RAW_TEXT);
    expect(token).not.toContain(RESULT.redactedSummary ?? '');
  });

  it('binds every persisted sensitive-review label into the receipt', () => {
    const token = issueSensitiveSaveReviewReceipt(FOUNDER_ID, RAW_TEXT, RESULT, NOW);
    const changedIntentTags = { ...RESULT, intentTags: ['general'] as DeterministicFriendIntakeResult['intentTags'] };
    const changedCategories = { ...RESULT, sensitiveCategories: ['health'] as DeterministicFriendIntakeResult['sensitiveCategories'] };

    expect(verifySensitiveSaveReviewReceipt(token, FOUNDER_ID, RAW_TEXT, changedIntentTags, NOW)).toBe(false);
    expect(verifySensitiveSaveReviewReceipt(token, FOUNDER_ID, RAW_TEXT, changedCategories, NOW)).toBe(false);
  });

  it('binds persisted move metadata into the review receipt', () => {
    const token = issueSensitiveSaveReviewReceipt(FOUNDER_ID, RAW_TEXT, RESULT, NOW);
    const changedKind = { ...RESULT, move: { ...RESULT.move, kind: 'clarifying_question' as const } };
    const changedPolicy = { ...RESULT, move: { ...RESULT.move, policy: 'clarifying' as const } };
    const changedDuration = { ...RESULT, move: { ...RESULT.move, timeEstimateMinutes: 10 } };
    const changedWarning = { ...RESULT, move: { ...RESULT.move, gateWarning: 'Changed warning.' } };

    expect(verifySensitiveSaveReviewReceipt(token, FOUNDER_ID, RAW_TEXT, changedKind, NOW)).toBe(false);
    expect(verifySensitiveSaveReviewReceipt(token, FOUNDER_ID, RAW_TEXT, changedPolicy, NOW)).toBe(false);
    expect(verifySensitiveSaveReviewReceipt(token, FOUNDER_ID, RAW_TEXT, changedDuration, NOW)).toBe(false);
    expect(verifySensitiveSaveReviewReceipt(token, FOUNDER_ID, RAW_TEXT, changedWarning, NOW)).toBe(false);
  });

  it('expires after the five-minute review window and rejects malformed receipts', () => {
    const token = issueSensitiveSaveReviewReceipt(FOUNDER_ID, RAW_TEXT, RESULT, NOW);

    expect(verifySensitiveSaveReviewReceipt(token, FOUNDER_ID, RAW_TEXT, RESULT, NOW + 300)).toBe(true);
    expect(verifySensitiveSaveReviewReceipt(token, FOUNDER_ID, RAW_TEXT, RESULT, NOW + 301)).toBe(false);
    expect(verifySensitiveSaveReviewReceipt('v1.invalid.receipt', FOUNDER_ID, RAW_TEXT, RESULT, NOW)).toBe(false);
  });
});
