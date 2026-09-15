import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {
  createGitHubAppJwt,
  getGitHubInstallationToken,
} from '../dist/providers/githubAppAuth.js';
import { providerForProject } from '../dist/providers/providerFactory.js';
import { produceDeterministicReview } from '../dist/review/deterministicReviewProducer.js';
import { expectedReviewSignalName } from '../dist/review/independentReviewGate.js';
import { resolveFounderMergeDecision } from './founder-merge-approval.mjs';

const PROJECT_ID = 'founder-control-room';
const REPOSITORY = 'jussray/founder-control-room';
const PROJECT = {
  repo_provider: 'github',
  slug: PROJECT_ID,
  repo_identifier: REPOSITORY,
};
const FOUNDER_LOGIN = 'jussray';
const FOUNDER_USER_ID = 286642846;
const REQUIRED_GATE_NAME = 'Required Gate';
const FOUNDER_FINAL_CHECK_NAME = 'Verify test-ledger contract';
const FOUNDER_FINAL_MAX_AGE_MS = 15 * 60 * 1000;
const FULL_SHA = /^[0-9a-f]{40}$/;
const ARTIFACT_PATH = 'artifacts/founder-final-gate.json';

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function lower(value) {
  return text(value).toLowerCase();
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function parseTime(value, label) {
  const parsed = Date.parse(text(value));
  if (!Number.isFinite(parsed)) throw new Error(`${label} timestamp is missing or invalid`);
  return parsed;
}

function canonicalFingerprint(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

async function writeArtifact(value) {
  await fs.mkdir('artifacts', { recursive: true });
  await fs.writeFile(ARTIFACT_PATH, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function githubJson(url, token, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 1000);
    throw new Error(`GitHub API ${response.status} for ${url}: ${detail}`);
  }
  return response.json();
}

async function listIssueComments(token, pullRequestNumber) {
  const comments = [];
  for (let page = 1; page <= 10; page += 1) {
    const url = `https://api.github.com/repos/${REPOSITORY}/issues/${pullRequestNumber}/comments?per_page=100&page=${page}`;
    const batch = await githubJson(url, token);
    if (!Array.isArray(batch)) throw new Error('FOUNDER_FINAL_COMMENT_LOOKUP_INVALID');
    comments.push(...batch);
    if (batch.length < 100) return comments;
  }
  throw new Error('FOUNDER_FINAL_COMMENT_PAGINATION_LIMIT_EXCEEDED');
}

async function assertNoUnresolvedReviewThreads(token, pullRequestNumber) {
  let after = null;
  do {
    const payload = await githubJson('https://api.github.com/graphql', token, {
      method: 'POST',
      body: JSON.stringify({
        query: `query($owner:String!,$repo:String!,$number:Int!,$after:String){
          repository(owner:$owner,name:$repo){
            pullRequest(number:$number){
              reviewThreads(first:100,after:$after){
                nodes{isResolved}
                pageInfo{hasNextPage endCursor}
              }
            }
          }
        }`,
        variables: {
          owner: 'jussray',
          repo: 'founder-control-room',
          number: pullRequestNumber,
          after,
        },
      }),
    });
    if (Array.isArray(payload?.errors) && payload.errors.length > 0) {
      throw new Error('FOUNDER_FINAL_REVIEW_THREAD_READBACK_FAILED');
    }
    const threads = payload?.data?.repository?.pullRequest?.reviewThreads;
    if (!threads || !Array.isArray(threads.nodes)) {
      throw new Error('FOUNDER_FINAL_REVIEW_THREAD_READBACK_MISSING');
    }
    if (threads.nodes.some((thread) => thread?.isResolved !== true)) {
      throw new Error('FOUNDER_FINAL_UNRESOLVED_REVIEW_THREADS');
    }
    after = threads.pageInfo?.hasNextPage ? threads.pageInfo?.endCursor : null;
  } while (after);
}

function trustedPassedSignal(signals, { name, headSha, appId, evidenceFingerprint }) {
  return signals.find((signal) =>
    signal?.name === name
    && signal?.status === 'passed'
    && lower(signal?.commitSha) === lower(headSha)
    && signal?.issuer?.kind === 'app'
    && text(signal?.issuer?.id) === appId
    && (evidenceFingerprint === undefined
      || lower(signal?.evidenceFingerprint) === lower(evidenceFingerprint)),
  ) ?? null;
}

async function publishFounderFinalCheck({ token, appId, headSha, fingerprint, summary }) {
  const existing = await githubJson(
    `https://api.github.com/repos/${REPOSITORY}/commits/${headSha}/check-runs?per_page=100&filter=latest`,
    token,
  );
  const exactExisting = (existing?.check_runs ?? []).find((run) =>
    run?.name === FOUNDER_FINAL_CHECK_NAME
    && run?.status === 'completed'
    && run?.conclusion === 'success'
    && lower(run?.head_sha) === lower(headSha)
    && lower(run?.external_id) === lower(fingerprint)
    && String(run?.app?.id ?? '') === appId,
  );
  if (!exactExisting) {
    await githubJson(`https://api.github.com/repos/${REPOSITORY}/check-runs`, token, {
      method: 'POST',
      body: JSON.stringify({
        name: FOUNDER_FINAL_CHECK_NAME,
        head_sha: headSha,
        status: 'completed',
        conclusion: 'success',
        external_id: fingerprint,
        output: {
          title: 'Founder Final Gate',
          summary,
        },
      }),
    });
  }

  const readback = await githubJson(
    `https://api.github.com/repos/${REPOSITORY}/commits/${headSha}/check-runs?per_page=100&filter=latest`,
    token,
  );
  const signal = (readback?.check_runs ?? []).find((run) =>
    run?.name === FOUNDER_FINAL_CHECK_NAME
    && run?.status === 'completed'
    && run?.conclusion === 'success'
    && lower(run?.head_sha) === lower(headSha)
    && lower(run?.external_id) === lower(fingerprint)
    && String(run?.app?.id ?? '') === appId,
  );
  if (!signal) throw new Error('FOUNDER_FINAL_PROVIDER_READBACK_MISSING');
  return {
    id: String(signal.id ?? ''),
    name: signal.name,
    headSha: lower(signal.head_sha),
    appId: String(signal.app?.id ?? ''),
    externalId: lower(signal.external_id),
    completedAt: signal.completed_at ?? null,
    detailsUrl: signal.details_url ?? null,
  };
}

let stage = 'input_validation';
let receipt = {
  schema: 'fcr/founder-final-gate@v1',
  status: 'failed',
  stage,
  generatedAt: new Date().toISOString(),
};

try {
  const rawPr = required('FCR_FINAL_PR_NUMBER');
  if (!/^[1-9]\d*$/.test(rawPr)) throw new Error('FCR_FINAL_PR_NUMBER must be a positive integer');
  const pullRequestNumber = Number(rawPr);
  if (!Number.isSafeInteger(pullRequestNumber)) throw new Error('FCR_FINAL_PR_NUMBER exceeds safe integer range');

  const commandCommentId = required('FOUNDER_APPROVAL_COMMENT_ID');
  const trustedMainSha = lower(required('EXPECTED_TRUSTED_MAIN_SHA'));
  if (!FULL_SHA.test(trustedMainSha)) throw new Error('EXPECTED_TRUSTED_MAIN_SHA must be a full commit SHA');

  stage = 'credential_preflight';
  const appId = required('GITHUB_APP_ID');
  const privateKey = required('GITHUB_PRIVATE_KEY');
  createGitHubAppJwt(appId, privateKey);
  const installationToken = await getGitHubInstallationToken(appId, privateKey, REPOSITORY);
  const provider = providerForProject(PROJECT);

  stage = 'trusted_main_preflight';
  const mainBefore = lower(await provider.resolveRef(PROJECT_ID, 'main'));
  if (mainBefore !== trustedMainSha) {
    throw new Error(`FOUNDER_FINAL_TRUSTED_MAIN_MOVED: expected ${trustedMainSha}, observed ${mainBefore}`);
  }

  stage = 'deterministic_review_readback';
  const production = await produceDeterministicReview({
    provider,
    projectId: PROJECT_ID,
    pullRequestNumber,
  });
  if (!production.publishable || production.receipt.verdict !== 'clear') {
    throw new Error('FOUNDER_FINAL_DETERMINISTIC_REVIEW_NOT_CLEAR');
  }
  if (production.receipt.findings.some((finding) => finding.severity !== 'P3')) {
    throw new Error('FOUNDER_FINAL_DETERMINISTIC_REVIEW_HAS_BLOCKING_FINDINGS');
  }
  const reviewReceipt = production.receipt;
  if (lower(reviewReceipt.baseSha) !== trustedMainSha) {
    throw new Error('FOUNDER_FINAL_REVIEW_BASE_IS_NOT_CURRENT_MAIN');
  }

  const signals = await provider.listVerificationSignals(PROJECT_ID, reviewReceipt.headSha);
  const requiredGate = trustedPassedSignal(signals, {
    name: REQUIRED_GATE_NAME,
    headSha: reviewReceipt.headSha,
    appId: '15368',
  });
  if (!requiredGate) throw new Error('FOUNDER_FINAL_REQUIRED_GATE_MISSING');

  const deterministicWitness = trustedPassedSignal(signals, {
    name: expectedReviewSignalName(reviewReceipt),
    headSha: reviewReceipt.headSha,
    appId,
    evidenceFingerprint: reviewReceipt.reviewHash,
  });
  if (!deterministicWitness) throw new Error('FOUNDER_FINAL_TRUSTED_DETERMINISTIC_WITNESS_MISSING');

  const proofReadyMs = Math.max(
    parseTime(requiredGate.completedAt, 'Required Gate completion'),
    parseTime(deterministicWitness.completedAt, 'deterministic witness completion'),
  );

  stage = 'founder_final_authority';
  const comments = await listIssueComments(installationToken, pullRequestNumber);
  const decision = resolveFounderMergeDecision(
    comments,
    {
      repository: REPOSITORY,
      prNumber: pullRequestNumber,
      baseSha: reviewReceipt.baseSha,
      headSha: reviewReceipt.headSha,
    },
    { login: FOUNDER_LOGIN, userId: FOUNDER_USER_ID },
  );
  if (!decision.approved) {
    throw new Error(decision.status === 'revoked'
      ? 'FOUNDER_FINAL_EXACT_CANDIDATE_REVOKED'
      : 'FOUNDER_FINAL_EXACT_CANDIDATE_APPROVAL_MISSING');
  }
  if (String(decision.sourceCommentId) !== commandCommentId) {
    throw new Error('FOUNDER_FINAL_TRIGGER_COMMENT_IS_NOT_LATEST_APPROVAL');
  }
  const approvedAtMs = parseTime(decision.approvedAt, 'Founder Final approval');
  if (approvedAtMs < proofReadyMs) {
    throw new Error('FOUNDER_FINAL_APPROVAL_PRECEDES_PROOF_READY');
  }
  const nowMs = Date.now();
  if (approvedAtMs > nowMs + 60_000 || nowMs - approvedAtMs > FOUNDER_FINAL_MAX_AGE_MS) {
    throw new Error('FOUNDER_FINAL_APPROVAL_STALE_OR_FUTURE');
  }

  stage = 'review_thread_readback';
  await assertNoUnresolvedReviewThreads(installationToken, pullRequestNumber);

  stage = 'prepublication_freshness';
  if (!provider.getPullRequestReviewContext) throw new Error('FOUNDER_FINAL_PR_CONTEXT_UNAVAILABLE');
  const context = await provider.getPullRequestReviewContext(PROJECT_ID, pullRequestNumber);
  const mainBeforePublish = lower(await provider.resolveRef(PROJECT_ID, 'main'));
  const headBeforePublish = lower(await provider.resolveRef(PROJECT_ID, context.headRef));
  if (
    lower(context.repository) !== REPOSITORY
    || lower(context.headRepository) !== REPOSITORY
    || context.baseRef !== 'main'
    || lower(context.baseSha) !== trustedMainSha
    || lower(context.headSha) !== lower(reviewReceipt.headSha)
    || mainBeforePublish !== trustedMainSha
    || headBeforePublish !== lower(reviewReceipt.headSha)
  ) {
    throw new Error('FOUNDER_FINAL_CANDIDATE_MOVED_BEFORE_PUBLICATION');
  }

  const fingerprint = canonicalFingerprint({
    schema: 'fcr/founder-final-gate-fingerprint@v1',
    repository: REPOSITORY,
    pullRequestNumber,
    baseSha: lower(reviewReceipt.baseSha),
    headSha: lower(reviewReceipt.headSha),
    reviewHash: lower(reviewReceipt.reviewHash),
    deterministicWitnessId: deterministicWitness.id,
    requiredGateId: requiredGate.id,
    approvalId: decision.approvalId,
    approvalCommentId: decision.sourceCommentId,
    proofReadyAt: new Date(proofReadyMs).toISOString(),
  });

  stage = 'provider_publication';
  const finalSignal = await publishFounderFinalCheck({
    token: installationToken,
    appId,
    headSha: reviewReceipt.headSha,
    fingerprint,
    summary: [
      `Repository: ${REPOSITORY}`,
      `PR: #${pullRequestNumber}`,
      `Base: ${reviewReceipt.baseSha}`,
      `Head: ${reviewReceipt.headSha}`,
      `Deterministic review: ${reviewReceipt.reviewHash}`,
      `Founder Final approval: ${decision.approvalId}`,
      'Deployment, provider-policy, database, credential, billing, publication, and destructive authority: not granted.',
    ].join('\n'),
  });

  stage = 'postpublication_freshness';
  const mainAfter = lower(await provider.resolveRef(PROJECT_ID, 'main'));
  const headAfter = lower(await provider.resolveRef(PROJECT_ID, context.headRef));
  if (mainAfter !== trustedMainSha || headAfter !== lower(reviewReceipt.headSha)) {
    throw new Error('FOUNDER_FINAL_CANDIDATE_MOVED_AFTER_PUBLICATION');
  }

  receipt = {
    schema: 'fcr/founder-final-gate@v1',
    status: 'verified',
    stage: 'complete',
    generatedAt: new Date().toISOString(),
    trustedMainSha,
    pullRequestNumber,
    baseSha: lower(reviewReceipt.baseSha),
    headSha: lower(reviewReceipt.headSha),
    deterministicReviewHash: lower(reviewReceipt.reviewHash),
    deterministicWitness: {
      id: deterministicWitness.id,
      name: deterministicWitness.name,
      issuerAppId: deterministicWitness.issuer?.id ?? null,
      completedAt: deterministicWitness.completedAt ?? null,
    },
    requiredGate: {
      id: requiredGate.id,
      issuerAppId: requiredGate.issuer?.id ?? null,
      completedAt: requiredGate.completedAt ?? null,
    },
    proofReadyAt: new Date(proofReadyMs).toISOString(),
    founderFinal: {
      approvalId: decision.approvalId,
      sourceCommentId: decision.sourceCommentId,
      approvedAt: decision.approvedAt,
      actorLogin: decision.actorLogin,
      actorUserId: decision.actorUserId,
    },
    providerSignal: finalSignal,
    authorizesMergeCandidate: true,
    authorizesDeploy: false,
    providerRulesetMutationAttempted: false,
    mergeExecutionAttempted: false,
  };
  await writeArtifact(receipt);
  console.log(JSON.stringify(receipt, null, 2));
} catch (error) {
  receipt = {
    ...receipt,
    status: 'failed',
    stage,
    generatedAt: new Date().toISOString(),
    failure: {
      name: error instanceof Error ? error.name : 'Error',
      message: error instanceof Error ? error.message : String(error),
    },
    authorizesMergeCandidate: false,
    authorizesDeploy: false,
    providerRulesetMutationAttempted: false,
    mergeExecutionAttempted: false,
  };
  try {
    await writeArtifact(receipt);
  } catch {
    console.error('Unable to retain sanitized Founder Final Gate receipt.');
  }
  throw error;
}
