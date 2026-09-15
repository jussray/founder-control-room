export const FOUNDER_MERGE_APPROVAL_SCHEMA = 'fcr/founder-merge-approval@v1';
export const FOUNDER_MERGE_APPROVAL_MARKER = 'fcr-founder-merge-approval:v1';

const DEFAULT_FOUNDER_LOGIN = 'jussray';
const DEFAULT_FOUNDER_USER_ID = 286642846;

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeSha(value) {
  return clean(value).toLowerCase();
}

function normalizeCandidate(candidate = {}) {
  return {
    repository: clean(candidate.repository),
    prNumber: Number(candidate.prNumber),
    baseSha: normalizeSha(candidate.baseSha),
    headSha: normalizeSha(candidate.headSha),
  };
}

function normalizeFounder(founder = {}) {
  return {
    login: clean(founder.login) || DEFAULT_FOUNDER_LOGIN,
    userId: Number(founder.userId || DEFAULT_FOUNDER_USER_ID),
  };
}

export function collectFounderMergeDecisions(comments, candidateInput, founderInput = {}) {
  const candidate = normalizeCandidate(candidateInput);
  const founder = normalizeFounder(founderInput);
  if (!candidate.repository || !Number.isInteger(candidate.prNumber) || candidate.prNumber < 1 || !candidate.baseSha || !candidate.headSha) {
    throw new Error('FOUNDER_MERGE_APPROVAL_CANDIDATE_REQUIRED');
  }
  if (!founder.login || !Number.isInteger(founder.userId) || founder.userId < 1) {
    throw new Error('FOUNDER_MERGE_APPROVAL_ACTOR_REQUIRED');
  }

  const marker = /<!--\s*fcr-founder-merge-approval:v1\s*([\s\S]*?)-->/g;
  const decisions = [];
  for (const comment of Array.isArray(comments) ? comments : []) {
    if (clean(comment?.user?.login) !== founder.login) continue;
    if (Number(comment?.user?.id) !== founder.userId) continue;
    if (!comment?.created_at || comment.created_at !== comment.updated_at) continue;
    const body = clean(comment?.body);
    if (!body) continue;

    for (const match of body.matchAll(marker)) {
      let receipt;
      try {
        receipt = JSON.parse(clean(match[1]));
      } catch {
        continue;
      }
      const decision = clean(receipt?.decision).toLowerCase();
      const approvalId = clean(receipt?.approval_id);
      const matchesCandidate = clean(receipt?.repository) === candidate.repository
        && Number(receipt?.pull_request) === candidate.prNumber
        && normalizeSha(receipt?.base_sha) === candidate.baseSha
        && normalizeSha(receipt?.head_sha) === candidate.headSha
        && ['approve', 'revoke'].includes(decision)
        && approvalId.length >= 8;
      if (!matchesCandidate) continue;

      decisions.push({
        commentId: String(comment.id || ''),
        commentUrl: clean(comment.html_url) || null,
        createdAt: comment.created_at,
        actorLogin: founder.login,
        actorUserId: founder.userId,
        repository: candidate.repository,
        prNumber: candidate.prNumber,
        baseSha: candidate.baseSha,
        headSha: candidate.headSha,
        decision,
        approvalId,
      });
    }
  }

  decisions.sort((left, right) => {
    const byTime = Date.parse(left.createdAt) - Date.parse(right.createdAt);
    if (byTime !== 0) return byTime;
    return Number(left.commentId || 0) - Number(right.commentId || 0);
  });
  return decisions;
}

export function resolveFounderMergeDecision(comments, candidate, founder = {}) {
  const decisions = collectFounderMergeDecisions(comments, candidate, founder);
  const latest = decisions.at(-1) || null;
  if (!latest) {
    return {
      schema: FOUNDER_MERGE_APPROVAL_SCHEMA,
      status: 'missing',
      approved: false,
      exactCandidateBound: true,
      decision: null,
      approvalId: null,
      sourceCommentId: null,
      sourceCommentUrl: null,
      approvedAt: null,
    };
  }

  const approved = latest.decision === 'approve';
  return {
    schema: FOUNDER_MERGE_APPROVAL_SCHEMA,
    status: approved ? 'approved' : 'revoked',
    approved,
    exactCandidateBound: true,
    decision: latest.decision,
    approvalId: latest.approvalId,
    sourceCommentId: latest.commentId,
    sourceCommentUrl: latest.commentUrl,
    approvedAt: approved ? latest.createdAt : null,
    decidedAt: latest.createdAt,
    actorLogin: latest.actorLogin,
    actorUserId: latest.actorUserId,
    repository: latest.repository,
    prNumber: latest.prNumber,
    baseSha: latest.baseSha,
    headSha: latest.headSha,
  };
}

export function mergeAuthorityStateForDecision(decision) {
  const approved = decision?.approved === true;
  return {
    mergeAuthorityAvailable: true,
    mergeApprovalRequired: true,
    mergeApproved: approved,
    authorizesMerge: approved,
    authorizesDeploy: false,
    mergeApprovalId: approved ? clean(decision.approvalId) || null : null,
    mergeApprovalComment: approved ? clean(decision.sourceCommentId) || null : null,
  };
}
