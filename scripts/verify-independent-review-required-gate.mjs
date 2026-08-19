const FULL_SHA = /^[0-9a-f]{40}$/i;
const REVIEW_RECEIPT_LINE = /^\s*Review-Receipt:\s*([0-9a-f]{64})\s*$/gim;

const text = (value) => typeof value === 'string' ? value.trim() : '';
const lower = (value) => text(value).toLowerCase();
const isBot = (value) => /\[bot\]$/i.test(text(value));

export function parseTrustedReviewerIds(raw) {
  const ids = text(raw).split(',').map((value) => value.trim()).filter(Boolean);
  if (ids.length === 0 || ids.length > 8) {
    throw new Error('FCR_TRUSTED_SEMANTIC_REVIEWER_IDS must contain 1-8 reviewer identities');
  }
  const normalized = ids.map(lower);
  if (new Set(normalized).size !== normalized.length) {
    throw new Error('FCR_TRUSTED_SEMANTIC_REVIEWER_IDS contains duplicate reviewer identities');
  }
  if (normalized.some(isBot)) {
    throw new Error('FCR_TRUSTED_SEMANTIC_REVIEWER_IDS cannot contain GitHub App bot identities');
  }
  return ids;
}

export function extractSingleReviewReceipt(body) {
  const matches = [...String(body ?? '').matchAll(REVIEW_RECEIPT_LINE)];
  if (matches.length !== 1) return null;
  return matches[0][1].toLowerCase();
}

export function latestReviewsByReviewer(reviews) {
  const latest = new Map();
  for (const review of Array.isArray(reviews) ? reviews : []) {
    const reviewerId = lower(review?.user?.login);
    if (!reviewerId) continue;
    const previous = latest.get(reviewerId);
    const currentTime = Date.parse(text(review?.submitted_at));
    const previousTime = Date.parse(text(previous?.submitted_at));
    const currentId = Number(review?.id ?? 0);
    const previousId = Number(previous?.id ?? 0);
    if (!previous
      || (!Number.isNaN(currentTime) && (Number.isNaN(previousTime) || currentTime > previousTime))
      || (currentTime === previousTime && currentId > previousId)) {
      latest.set(reviewerId, review);
    }
  }
  return latest;
}

export function qualifyingReviewCandidates({ reviews, trustedReviewerIds, authorIdentity, headSha }) {
  if (!FULL_SHA.test(text(headSha))) {
    throw new Error('Independent review advisory requires an exact 40-character PR head SHA');
  }

  const trusted = new Set((Array.isArray(trustedReviewerIds) ? trustedReviewerIds : []).map(lower));
  const author = lower(authorIdentity);
  const latest = latestReviewsByReviewer(reviews);
  const candidates = [];

  for (const reviewerId of trusted) {
    if (!reviewerId || reviewerId === author || isBot(reviewerId)) continue;
    const review = latest.get(reviewerId);
    if (!review) continue;
    if (String(review.state ?? '').toUpperCase() !== 'APPROVED') continue;
    if (lower(review.commit_id) !== lower(headSha)) continue;
    const receiptHash = extractSingleReviewReceipt(review.body);
    if (!receiptHash) continue;
    candidates.push({ reviewerId, receiptHash, reviewId: String(review.id ?? '') });
  }

  return candidates;
}
