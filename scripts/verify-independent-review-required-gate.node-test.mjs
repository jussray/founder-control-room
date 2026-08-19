import assert from 'node:assert/strict';
import test from 'node:test';

import {
  extractSingleReviewReceipt,
  latestReviewsByReviewer,
  parseTrustedReviewerIds,
  qualifyingReviewCandidates,
} from './verify-independent-review-required-gate.mjs';

const HEAD = 'a'.repeat(40);
const RECEIPT = 'b'.repeat(64);

function review(overrides = {}) {
  return {
    id: 1,
    state: 'APPROVED',
    body: `Review-Receipt: ${RECEIPT}`,
    commit_id: HEAD,
    submitted_at: '2026-08-19T01:00:00Z',
    user: { login: 'trusted-human' },
    ...overrides,
  };
}

test('trusted reviewer ids fail closed for empty, duplicate, or bot policy', () => {
  assert.throws(() => parseTrustedReviewerIds(''), /1-8 reviewer identities/);
  assert.throws(() => parseTrustedReviewerIds('Alice,alice'), /duplicate/);
  assert.throws(() => parseTrustedReviewerIds('reviewer[bot]'), /bot identities/);
  assert.deepEqual(parseTrustedReviewerIds('Alice, Bob'), ['Alice', 'Bob']);
});

test('review receipt requires exactly one full sha256 marker', () => {
  assert.equal(extractSingleReviewReceipt(`Review-Receipt: ${RECEIPT}`), RECEIPT);
  assert.equal(extractSingleReviewReceipt('Review-Receipt: nope'), null);
  assert.equal(
    extractSingleReviewReceipt(`Review-Receipt: ${RECEIPT}\nReview-Receipt: ${'c'.repeat(64)}`),
    null,
  );
});

test('latest review from a reviewer is authoritative advisory evidence', () => {
  const older = review({ id: 1, state: 'APPROVED', submitted_at: '2026-08-19T01:00:00Z' });
  const newer = review({ id: 2, state: 'CHANGES_REQUESTED', submitted_at: '2026-08-19T01:01:00Z' });
  const latest = latestReviewsByReviewer([older, newer]);
  assert.equal(latest.get('trusted-human')?.id, 2);
});

test('exact-head trusted non-author approval with one receipt qualifies as advisory evidence', () => {
  const candidates = qualifyingReviewCandidates({
    reviews: [review()],
    trustedReviewerIds: ['trusted-human'],
    authorIdentity: 'jussray',
    headSha: HEAD,
  });
  assert.deepEqual(candidates, [{ reviewerId: 'trusted-human', receiptHash: RECEIPT, reviewId: '1' }]);
});

test('owner, bot, stale-head, and latest changes-requested reviews cannot qualify', () => {
  assert.equal(qualifyingReviewCandidates({
    reviews: [review({ user: { login: 'jussray' } })],
    trustedReviewerIds: ['jussray'],
    authorIdentity: 'jussray',
    headSha: HEAD,
  }).length, 0);

  assert.equal(qualifyingReviewCandidates({
    reviews: [review({ user: { login: 'reviewer[bot]' } })],
    trustedReviewerIds: ['reviewer[bot]'],
    authorIdentity: 'jussray',
    headSha: HEAD,
  }).length, 0);

  assert.equal(qualifyingReviewCandidates({
    reviews: [review({ commit_id: 'c'.repeat(40) })],
    trustedReviewerIds: ['trusted-human'],
    authorIdentity: 'jussray',
    headSha: HEAD,
  }).length, 0);

  assert.equal(qualifyingReviewCandidates({
    reviews: [
      review({ id: 1, submitted_at: '2026-08-19T01:00:00Z' }),
      review({ id: 2, state: 'CHANGES_REQUESTED', submitted_at: '2026-08-19T01:01:00Z' }),
    ],
    trustedReviewerIds: ['trusted-human'],
    authorIdentity: 'jussray',
    headSha: HEAD,
  }).length, 0);
});
