import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  CANONICAL_RULESET_NAME,
  CODEQL_SECURITY_FLOOR,
  REQUIRED_CHECKS,
  canonicalFreshnessRulesetName,
  collaboratorCanReview,
  parseRepository,
  rulesetSnapshot,
  trustedBypassPolicy,
} from './audit-github-governance-preflight.mjs';

export const CONTRACT = 'fcr/github-governance-phase-preflight@v1';
export const PHASES = ['founder_only', 'independent_review'];
const API_VERSION = '2026-03-10';
const API_ROOT = 'https://api.github.com';
const RECEIPT_PATH = 'artifacts/github-governance-phase-preflight.json';

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizePhase(value) {
  const phase = text(value);
  if (!PHASES.includes(phase)) throw new Error('FCR_GOVERNANCE_PHASE must be founder_only or independent_review');
  return phase;
}

function exactRuleTypes(snapshot, types) {
  return JSON.stringify([...(snapshot?.ruleTypes ?? [])].sort()) === JSON.stringify([...types].sort());
}

function exactChecks(snapshot) {
  return JSON.stringify([...(snapshot?.requiredStatusCheckNames ?? [])].sort()) === JSON.stringify([...REQUIRED_CHECKS].sort());
}

function codeQlFloor(snapshot) {
  const tools = snapshot?.codeScanningTools ?? [];
  return tools.length === 1
    && tools[0]?.tool === CODEQL_SECURITY_FLOOR.tool
    && tools[0]?.securityAlertsThreshold === CODEQL_SECURITY_FLOOR.securityAlertsThreshold
    && tools[0]?.alertsThreshold === CODEQL_SECURITY_FLOOR.alertsThreshold;
}

function bypassMatches(snapshot, expected) {
  return snapshot?.bypassObservationComplete === true
    && Array.isArray(snapshot.bypassActors)
    && Array.isArray(expected)
    && JSON.stringify(snapshot.bypassActors) === JSON.stringify(expected);
}

export function reviewFloorSatisfied(snapshot, phase, expectedBypass) {
  if (!snapshot) return false;
  const independent = phase === 'independent_review';
  return snapshot.name === CANONICAL_RULESET_NAME
    && snapshot.enforcement === 'active'
    && snapshot.target === 'branch'
    && snapshot.targetsRequestedRef === true
    && exactRuleTypes(snapshot, ['pull_request', 'code_scanning', 'non_fast_forward', 'deletion'])
    && snapshot.requirePullRequest === true
    && snapshot.requiredApprovingReviewCount === (independent ? 1 : 0)
    && snapshot.dismissStaleReviewsOnPush === independent
    && snapshot.requireCodeOwnerReview === independent
    && snapshot.requireLastPushApproval === independent
    && snapshot.requiredReviewThreadResolution === true
    && snapshot.strictRequiredStatusChecks === false
    && snapshot.requiredStatusCheckNames.length === 0
    && codeQlFloor(snapshot)
    && snapshot.blockForcePushes === true
    && snapshot.blockDeletion === true
    && bypassMatches(snapshot, expectedBypass);
}

export function freshnessFloorSatisfied(snapshot, expectedName = canonicalFreshnessRulesetName()) {
  if (!snapshot) return false;
  return snapshot.name === expectedName
    && snapshot.enforcement === 'active'
    && snapshot.target === 'branch'
    && snapshot.targetsRequestedRef === true
    && exactRuleTypes(snapshot, ['required_status_checks'])
    && snapshot.requirePullRequest === false
    && snapshot.strictRequiredStatusChecks === true
    && exactChecks(snapshot)
    && snapshot.blockForcePushes === false
    && snapshot.blockDeletion === false
    && snapshot.bypassObservationComplete === true
    && Array.isArray(snapshot.bypassActors)
    && snapshot.bypassActors.length === 0;
}

export function buildPhaseReport({ repository, targetRef = 'main', defaultBranch = targetRef, phase, fullRulesets, collaborators, trustedGitHubAppId }) {
  const normalizedPhase = normalizePhase(phase);
  const { owner } = parseRepository(repository);
  const expectedBypass = trustedBypassPolicy(trustedGitHubAppId);
  const freshnessName = canonicalFreshnessRulesetName();
  const snapshots = fullRulesets
    .filter((ruleset) => ruleset?.target === 'branch')
    .map((ruleset) => rulesetSnapshot(ruleset, targetRef, defaultBranch));
  const active = snapshots.filter((snapshot) => snapshot.enforcement === 'active' && snapshot.targetsRequestedRef);
  const reviewMatches = snapshots.filter((snapshot) => snapshot.name === CANONICAL_RULESET_NAME);
  const freshnessMatches = snapshots.filter((snapshot) => snapshot.name === freshnessName);
  const review = reviewMatches[0] ?? null;
  const freshness = freshnessMatches[0] ?? null;
  const eligible = collaborators.filter((collaborator) => collaboratorCanReview(collaborator, owner));
  const reviewFloor = expectedBypass !== null && reviewFloorSatisfied(review, normalizedPhase, expectedBypass);
  const freshnessFloor = freshnessFloorSatisfied(freshness, freshnessName);
  const reviewerRequirementSatisfied = normalizedPhase === 'founder_only' || eligible.length > 0;
  const observationComplete = expectedBypass !== null
    && (review === null || review.bypassObservationComplete === true)
    && (freshness === null || freshness.bypassObservationComplete === true);

  return {
    contract: CONTRACT,
    repository,
    targetRef,
    defaultBranch,
    governancePhase: normalizedPhase,
    observedAt: new Date().toISOString(),
    providerMutationPerformed: false,
    observationComplete,
    activeRulesetCountTargetingRef: active.length,
    canonicalRulesetMatchCount: reviewMatches.length,
    canonicalFreshnessRulesetMatchCount: freshnessMatches.length,
    canonicalRuleset: review,
    canonicalFreshnessRuleset: freshness,
    reviewFloorSatisfied: reviewFloor,
    freshnessFloorSatisfied: freshnessFloor,
    independentReviewerReady: eligible.length > 0,
    eligibleNonOwnerWriteReviewerCount: eligible.length,
    reviewerRequirementSatisfied,
    status: observationComplete
      && active.length === 2
      && reviewMatches.length === 1
      && freshnessMatches.length === 1
      && reviewFloor
      && freshnessFloor
      && reviewerRequirementSatisfied
        ? 'READY'
        : observationComplete ? 'NOT_READY' : 'BLOCKED',
  };
}

async function githubGet(path, token) {
  const response = await fetch(`${API_ROOT}${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': API_VERSION,
      'User-Agent': 'founder-control-room-governance-phase-preflight',
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`GitHub provider read failed for ${path}: HTTP ${response.status}`);
  return body;
}

async function listAll(path, token) {
  const out = [];
  for (let page = 1; page <= 20; page += 1) {
    const separator = path.includes('?') ? '&' : '?';
    const body = await githubGet(`${path}${separator}per_page=100&page=${page}`, token);
    if (!Array.isArray(body)) throw new Error(`Expected array from provider read: ${path}`);
    out.push(...body);
    if (body.length < 100) break;
  }
  return out;
}

export async function collectFcrGovernancePhase({ token, repository, targetRef = 'main', phase, trustedGitHubAppId }) {
  if (!text(token)) throw new Error('GITHUB_TOKEN is required');
  const { owner, repo } = parseRepository(repository);
  const repositoryState = await githubGet(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, token);
  const defaultBranch = text(repositoryState?.default_branch) || targetRef;
  const summaries = await listAll(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/rulesets?includes_parents=false`, token);
  const fullRulesets = [];
  for (const ruleset of summaries) {
    if (ruleset?.id == null) continue;
    fullRulesets.push(await githubGet(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/rulesets/${encodeURIComponent(String(ruleset.id))}?includes_parents=false`, token));
  }
  const collaborators = await listAll(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/collaborators?affiliation=all`, token);
  return buildPhaseReport({ repository, targetRef, defaultBranch, phase, fullRulesets, collaborators, trustedGitHubAppId });
}

function writeReceipt(report) {
  mkdirSync('artifacts', { recursive: true });
  writeFileSync(RECEIPT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

async function main() {
  const report = await collectFcrGovernancePhase({
    token: process.env.GITHUB_TOKEN,
    repository: process.env.GITHUB_REPOSITORY,
    targetRef: process.env.FCR_GOVERNANCE_TARGET_REF || 'main',
    phase: process.env.FCR_GOVERNANCE_PHASE,
    trustedGitHubAppId: process.env.GITHUB_APP_ID,
  });
  writeReceipt(report);
  console.log(JSON.stringify({
    contract: report.contract,
    repository: report.repository,
    governancePhase: report.governancePhase,
    status: report.status,
    reviewFloorSatisfied: report.reviewFloorSatisfied,
    freshnessFloorSatisfied: report.freshnessFloorSatisfied,
    reviewerRequirementSatisfied: report.reviewerRequirementSatisfied,
    eligibleNonOwnerWriteReviewerCount: report.eligibleNonOwnerWriteReviewerCount,
  }, null, 2));
  if (report.status !== 'READY') process.exitCode = 1;
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invoked) main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
