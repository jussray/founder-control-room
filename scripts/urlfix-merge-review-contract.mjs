const SHA40 = /^[a-f0-9]{40}$/i;
const REPOSITORY = /^[^/]+\/[^/]+$/;
const ISSUE_ID = /^URLFIX-[0-9]+$/;

export function evaluateUrlFixMergeReviewHandoff(packet) {
  const errors = [];

  if (!packet || typeof packet !== 'object' || Array.isArray(packet)) {
    return { reviewHandoffReady: false, mergeAuthorized: false, errors: ['handoff packet must be an object'] };
  }

  if (packet.schema !== 'juss/urlfix-merge-review@v1') errors.push('unexpected merge-review schema');
  if (typeof packet.repository !== 'string' || !REPOSITORY.test(packet.repository)) errors.push('repository must be owner/name');
  if (!Number.isInteger(packet.pullRequest) || packet.pullRequest < 1) errors.push('pull request number is required for merge review');

  for (const [label, ref] of [['base', packet.base], ['head', packet.head]]) {
    if (!ref || typeof ref !== 'object') {
      errors.push(`${label} ref is required`);
      continue;
    }
    if (typeof ref.ref !== 'string' || !ref.ref.trim()) errors.push(`${label} branch/ref is required`);
    if (typeof ref.sha !== 'string' || !SHA40.test(ref.sha)) errors.push(`${label} must carry an exact 40-character SHA`);
  }

  if (packet.base?.sha && packet.head?.sha && packet.base.sha === packet.head.sha) {
    errors.push('base and head resolve to the same commit; there is no merge candidate diff');
  }

  const issueIds = packet.repair?.issueIds;
  if (!Array.isArray(issueIds) || issueIds.length === 0 || issueIds.some((id) => typeof id !== 'string' || !ISSUE_ID.test(id))) {
    errors.push('repair issueIds must contain at least one URLFIX issue id');
  }
  if (typeof packet.repair?.carrier !== 'string' || !packet.repair.carrier.trim()) errors.push('repair carrier is required');

  const exactHeadSha = packet.proof?.exactHeadSha;
  if (typeof exactHeadSha !== 'string' || !SHA40.test(exactHeadSha)) {
    errors.push('proof must be bound to an exact 40-character head SHA');
  } else if (packet.head?.sha && exactHeadSha !== packet.head.sha) {
    errors.push('URLFix proof subject does not match the merge-review head SHA');
  }

  if (!Array.isArray(packet.proof?.proofRefs) || packet.proof.proofRefs.length === 0) {
    errors.push('at least one proof reference is required');
  }

  if (packet.handoff?.intent !== 'REVIEW_ONLY') errors.push('URLFix handoff intent must remain REVIEW_ONLY');
  if (packet.handoff?.reviewSkill !== 'review-verify-merge') errors.push('merge review must be delegated to review-verify-merge');
  if (packet.handoff?.mergeAuthorized !== false) errors.push('URLFix must never grant merge authority');
  if (packet.expiresOnRefMovement !== true) errors.push('merge-review packet must expire on base/head movement');

  const issuedAt = Date.parse(packet.issuedAt);
  if (!Number.isFinite(issuedAt)) errors.push('issuedAt must be an ISO-8601 timestamp');

  return {
    reviewHandoffReady: errors.length === 0,
    mergeAuthorized: false,
    errors,
  };
}
