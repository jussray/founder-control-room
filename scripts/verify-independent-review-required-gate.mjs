import { readFileSync } from 'node:fs';

const FULL_SHA = /^[0-9a-f]{40}$/i;
const REVIEW_RECEIPT_LINE = /^\s*Review-Receipt:\s*([0-9a-f]{64})\s*$/gim;
const FCR_REPOSITORY = 'jussray/founder-control-room';
const WRITE_PERMISSIONS = new Set(['admin', 'maintain', 'write']);

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
  if (!FULL_SHA.test(text(headSha))) throw new Error('Independent review gate requires an exact 40-character PR head SHA');
  const trusted = new Set(trustedReviewerIds.map(lower));
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

async function githubJson(url, token) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'fcr-independent-review-required-gate',
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub provider read failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function listReviews(repository, pullRequestNumber, token) {
  const [owner, repo] = repository.split('/');
  const reviews = [];
  for (let page = 1; page <= 10; page += 1) {
    const batch = await githubJson(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${pullRequestNumber}/reviews?per_page=100&page=${page}`,
      token,
    );
    if (!Array.isArray(batch)) throw new Error('GitHub review readback must be an array');
    reviews.push(...batch);
    if (batch.length < 100) break;
    if (page === 10) throw new Error('Independent review gate refuses more than 1000 review submissions');
  }
  return reviews;
}

async function reviewerHasWriteAuthority(repository, reviewerId, token) {
  const [owner, repo] = repository.split('/');
  const result = await githubJson(
    `https://api.github.com/repos/${owner}/${repo}/collaborators/${encodeURIComponent(reviewerId)}/permission`,
    token,
  );
  return WRITE_PERMISSIONS.has(lower(result?.permission));
}

export async function verifyIndependentReviewRequiredGate(env = process.env) {
  const eventName = text(env.GITHUB_EVENT_NAME);
  const repository = lower(env.GITHUB_REPOSITORY);
  const expectedHeadSha = lower(env.EXPECTED_HEAD_SHA);

  if (eventName === 'push') {
    console.log('Independent review gate: post-merge push run; PR review is not applicable.');
    return { status: 'not-applicable', repository, headSha: expectedHeadSha };
  }

  if (eventName !== 'pull_request' && eventName !== 'pull_request_review') {
    throw new Error(`Independent review gate does not support event ${eventName || 'UNKNOWN'}`);
  }
  if (repository !== FCR_REPOSITORY) throw new Error(`Independent review gate is scoped to ${FCR_REPOSITORY}`);
  if (!FULL_SHA.test(expectedHeadSha)) throw new Error('EXPECTED_HEAD_SHA must be an exact 40-character SHA');

  const token = text(env.GITHUB_TOKEN);
  const eventPath = text(env.GITHUB_EVENT_PATH);
  if (!token) throw new Error('GITHUB_TOKEN is required for provider review readback');
  if (!eventPath) throw new Error('GITHUB_EVENT_PATH is required for pull request identity');

  const event = JSON.parse(readFileSync(eventPath, 'utf8'));
  const pullRequestNumber = Number(event?.pull_request?.number ?? event?.number);
  if (!Number.isInteger(pullRequestNumber) || pullRequestNumber <= 0) {
    throw new Error('Pull request event does not contain a positive pull request number');
  }

  const [owner, repo] = repository.split('/');
  const pullRequest = await githubJson(
    `https://api.github.com/repos/${owner}/${repo}/pulls/${pullRequestNumber}`,
    token,
  );
  if (pullRequest?.state !== 'open') throw new Error(`Pull request #${pullRequestNumber} must remain open`);
  if (pullRequest?.draft === true) throw new Error(`Pull request #${pullRequestNumber} must be ready for independent review, not draft`);
  if (lower(pullRequest?.head?.sha) !== expectedHeadSha) {
    throw new Error(`Pull request #${pullRequestNumber} head drifted from EXPECTED_HEAD_SHA`);
  }

  const authorIdentity = lower(pullRequest?.user?.login);
  if (!authorIdentity) throw new Error('Pull request author identity is unavailable');
  const trustedReviewerIds = parseTrustedReviewerIds(env.FCR_TRUSTED_SEMANTIC_REVIEWER_IDS);
  if (trustedReviewerIds.map(lower).includes(authorIdentity)) {
    throw new Error('FCR trusted reviewer policy cannot include the pull request author');
  }

  const reviews = await listReviews(repository, pullRequestNumber, token);
  const candidates = qualifyingReviewCandidates({
    reviews,
    trustedReviewerIds,
    authorIdentity,
    headSha: expectedHeadSha,
  });

  if (candidates.length === 0) {
    throw new Error(
      `Independent review blocked for PR #${pullRequestNumber}: require a latest exact-head APPROVED review from a trusted non-author human with exactly one Review-Receipt: <sha256> line`,
    );
  }

  const authorized = [];
  for (const candidate of candidates) {
    if (await reviewerHasWriteAuthority(repository, candidate.reviewerId, token)) authorized.push(candidate);
  }
  if (authorized.length === 0) {
    throw new Error(
      `Independent review blocked for PR #${pullRequestNumber}: no qualifying trusted reviewer has current write authority`,
    );
  }

  console.log(JSON.stringify({
    contract: 'fcr/github-required-independent-review@v1',
    repository,
    pullRequestNumber,
    headSha: expectedHeadSha,
    authorIdentity,
    qualifyingReviewerIds: authorized.map((candidate) => candidate.reviewerId).sort(),
    receiptHashes: authorized.map((candidate) => candidate.receiptHash).sort(),
    reviewGateSatisfied: true,
  }, null, 2));

  return { status: 'passed', pullRequestNumber, headSha: expectedHeadSha, authorized };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  verifyIndependentReviewRequiredGate().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
