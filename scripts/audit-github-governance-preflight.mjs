import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const CONTRACT = 'fcr/github-governance-preflight@v2';
export const CANONICAL_RULESET_NAME = 'Founder Control Room main exact-head gate';
export const REQUIRED_CHECKS = ['Required Gate', 'Verify test-ledger contract'];

const API_VERSION = '2026-03-10';
const API_ROOT = 'https://api.github.com';
const RECEIPT_PATH = 'artifacts/github-governance-preflight.json';

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function parseRepository(value) {
  const [owner, repo, ...rest] = text(value).split('/');
  if (!owner || !repo || rest.length > 0) throw new Error('GITHUB_REPOSITORY must be owner/repo');
  return { owner, repo };
}

function branchTargets(ruleset) {
  const include = ruleset?.conditions?.ref_name?.include;
  return Array.isArray(include) ? include.filter((value) => typeof value === 'string') : [];
}

function ruleOfType(ruleset, type) {
  const rules = Array.isArray(ruleset?.rules) ? ruleset.rules : [];
  return rules.find((rule) => rule?.type === type) ?? null;
}

export function canonicalFreshnessRulesetName(reviewRulesetName = CANONICAL_RULESET_NAME) {
  return `${reviewRulesetName} [strict freshness]`;
}

export function trustedBypassPolicy(appId) {
  const id = text(appId);
  if (!/^\d+$/.test(id)) return null;
  return [{ actorType: 'Integration', actorId: id, bypassMode: 'pull_request' }];
}

export function rulesetSnapshot(ruleset, targetRef = 'main', defaultBranch = targetRef) {
  const pull = ruleOfType(ruleset, 'pull_request');
  const status = ruleOfType(ruleset, 'required_status_checks');
  const statusChecks = Array.isArray(status?.parameters?.required_status_checks)
    ? status.parameters.required_status_checks
        .map((entry) => text(entry?.context))
        .filter(Boolean)
    : [];
  const bypassObservationComplete = Array.isArray(ruleset?.bypass_actors);
  const bypassActors = bypassObservationComplete
    ? ruleset.bypass_actors.map((actor) => ({
        actorType: text(actor?.actor_type),
        actorId: actor?.actor_id == null ? null : String(actor.actor_id),
        bypassMode: text(actor?.bypass_mode),
      })).sort((a, b) => `${a.actorType}:${a.actorId}:${a.bypassMode}`.localeCompare(`${b.actorType}:${b.actorId}:${b.bypassMode}`))
    : null;
  const targets = branchTargets(ruleset);
  const targetTokens = new Set([`refs/heads/${targetRef}`]);
  if (text(defaultBranch) === text(targetRef)) targetTokens.add('~DEFAULT_BRANCH');

  return {
    id: ruleset?.id == null ? '' : String(ruleset.id),
    name: text(ruleset?.name),
    enforcement: text(ruleset?.enforcement),
    target: text(ruleset?.target),
    targetRefs: targets,
    targetsRequestedRef: targets.some((target) => targetTokens.has(target)),
    requirePullRequest: Boolean(pull),
    requiredApprovingReviewCount: Number(pull?.parameters?.required_approving_review_count ?? 0),
    dismissStaleReviewsOnPush: pull?.parameters?.dismiss_stale_reviews_on_push === true,
    requireLastPushApproval: pull?.parameters?.require_last_push_approval === true,
    requiredReviewThreadResolution: pull?.parameters?.required_review_thread_resolution === true,
    strictRequiredStatusChecks: status?.parameters?.strict_required_status_checks_policy === true,
    requiredStatusCheckNames: statusChecks.sort(),
    blockForcePushes: Boolean(ruleOfType(ruleset, 'non_fast_forward')),
    blockDeletion: Boolean(ruleOfType(ruleset, 'deletion')),
    bypassObservationComplete,
    bypassActors,
  };
}

export function collaboratorCanReview(collaborator, ownerLogin) {
  const login = text(collaborator?.login);
  if (!login || login.toLowerCase() === text(ownerLogin).toLowerCase()) return false;
  if (/\[bot\]$/i.test(login) || collaborator?.type === 'Bot') return false;
  const permissions = collaborator?.permissions ?? {};
  return permissions.push === true || permissions.maintain === true || permissions.admin === true;
}

export function bypassPolicyMatches(snapshot, expectedBypassActors) {
  if (!snapshot?.bypassObservationComplete || !Array.isArray(snapshot.bypassActors)) return false;
  if (!Array.isArray(expectedBypassActors)) return false;
  return JSON.stringify(snapshot.bypassActors) === JSON.stringify(expectedBypassActors);
}

function exactRequiredChecksMatch(snapshot) {
  const observed = Array.isArray(snapshot?.requiredStatusCheckNames)
    ? [...snapshot.requiredStatusCheckNames].sort()
    : [];
  const expected = [...REQUIRED_CHECKS].sort();
  return JSON.stringify(observed) === JSON.stringify(expected);
}

export function canonicalFloorSatisfied(snapshot, expectedBypassActors) {
  if (!snapshot) return false;
  return snapshot.name === CANONICAL_RULESET_NAME
    && snapshot.enforcement === 'active'
    && snapshot.target === 'branch'
    && snapshot.targetsRequestedRef === true
    && snapshot.requirePullRequest === true
    && snapshot.requiredApprovingReviewCount >= 1
    && snapshot.dismissStaleReviewsOnPush === true
    && snapshot.requireLastPushApproval === true
    && snapshot.requiredReviewThreadResolution === true
    && snapshot.strictRequiredStatusChecks === false
    && snapshot.requiredStatusCheckNames.length === 0
    && snapshot.blockForcePushes === true
    && snapshot.blockDeletion === true
    && bypassPolicyMatches(snapshot, expectedBypassActors);
}

export function freshnessFloorSatisfied(snapshot, expectedName = canonicalFreshnessRulesetName()) {
  if (!snapshot) return false;
  return snapshot.name === expectedName
    && snapshot.enforcement === 'active'
    && snapshot.target === 'branch'
    && snapshot.targetsRequestedRef === true
    && snapshot.requirePullRequest === false
    && snapshot.strictRequiredStatusChecks === true
    && exactRequiredChecksMatch(snapshot)
    && snapshot.blockForcePushes === false
    && snapshot.blockDeletion === false
    && snapshot.bypassObservationComplete === true
    && Array.isArray(snapshot.bypassActors)
    && snapshot.bypassActors.length === 0;
}

export function buildReport({
  repository,
  targetRef = 'main',
  defaultBranch = targetRef,
  fullRulesets,
  collaborators,
  canonicalName = CANONICAL_RULESET_NAME,
  trustedGitHubAppId,
}) {
  const { owner } = parseRepository(repository);
  const expectedBypassActors = trustedBypassPolicy(trustedGitHubAppId);
  const freshnessName = canonicalFreshnessRulesetName(canonicalName);
  const snapshots = fullRulesets
    .filter((ruleset) => ruleset?.target === 'branch')
    .map((ruleset) => rulesetSnapshot(ruleset, targetRef, defaultBranch));
  const activeTargetingRef = snapshots.filter((snapshot) =>
    snapshot.enforcement === 'active' && snapshot.targetsRequestedRef);
  const canonicalMatches = snapshots.filter((snapshot) => snapshot.name === canonicalName);
  const freshnessMatches = snapshots.filter((snapshot) => snapshot.name === freshnessName);
  const canonical = canonicalMatches[0] ?? null;
  const freshness = freshnessMatches[0] ?? null;
  const eligibleReviewers = collaborators.filter((collaborator) => collaboratorCanReview(collaborator, owner));
  const bypassObservationComplete = canonical?.bypassObservationComplete === true;
  const freshnessBypassObservationComplete = freshness?.bypassObservationComplete === true;
  const observationComplete = expectedBypassActors !== null
    && (canonical === null || bypassObservationComplete)
    && (freshness === null || freshnessBypassObservationComplete);
  const blocker = expectedBypassActors === null
    ? 'trusted_bypass_policy_unavailable'
    : canonical !== null && !bypassObservationComplete
      ? 'review_bypass_observation_unavailable'
      : freshness !== null && !freshnessBypassObservationComplete
        ? 'freshness_bypass_observation_unavailable'
        : null;
  const canonicalFloor = canonicalFloorSatisfied(canonical, expectedBypassActors);
  const freshnessFloor = freshnessFloorSatisfied(freshness, freshnessName);
  const reviewBypassSatisfied = canonical === null ? false : bypassPolicyMatches(canonical, expectedBypassActors);
  const freshnessBypassSatisfied = freshness === null
    ? false
    : freshness.bypassObservationComplete === true
      && Array.isArray(freshness.bypassActors)
      && freshness.bypassActors.length === 0;

  return {
    contract: CONTRACT,
    repository,
    targetRef,
    defaultBranch,
    canonicalRulesetName: canonicalName,
    canonicalFreshnessRulesetName: freshnessName,
    observedAt: new Date().toISOString(),
    providerMutationPerformed: false,
    observationComplete,
    blocker,
    activeRulesetCountTargetingRef: activeTargetingRef.length,
    canonicalRulesetMatchCount: canonicalMatches.length,
    canonicalFreshnessRulesetMatchCount: freshnessMatches.length,
    canonicalRuleset: canonical,
    canonicalFreshnessRuleset: freshness,
    canonicalFloorSatisfied: canonicalFloor,
    freshnessFloorSatisfied: freshnessFloor,
    bypassObservationComplete: canonical === null ? null : bypassObservationComplete,
    freshnessBypassObservationComplete: freshness === null ? null : freshnessBypassObservationComplete,
    trustedBypassPolicyAvailable: expectedBypassActors !== null,
    bypassPolicySatisfied: reviewBypassSatisfied,
    freshnessBypassPolicySatisfied: freshnessBypassSatisfied,
    independentReviewerReady: eligibleReviewers.length > 0,
    eligibleNonOwnerWriteReviewerCount: eligibleReviewers.length,
    observedBranchRulesets: snapshots,
    status: !observationComplete
      ? 'BLOCKED'
      : canonicalMatches.length === 1
        && freshnessMatches.length === 1
        && activeTargetingRef.length === 2
        && canonicalFloor
        && freshnessFloor
        && eligibleReviewers.length > 0
          ? 'READY'
          : 'NOT_READY',
  };
}

export function buildBlockedReport({ repository, targetRef = 'main', reason = 'provider_read_unavailable' }) {
  return {
    contract: CONTRACT,
    repository: text(repository) || 'unknown',
    targetRef: text(targetRef) || 'main',
    defaultBranch: null,
    canonicalRulesetName: CANONICAL_RULESET_NAME,
    canonicalFreshnessRulesetName: canonicalFreshnessRulesetName(),
    observedAt: new Date().toISOString(),
    providerMutationPerformed: false,
    observationComplete: false,
    blocker: reason,
    activeRulesetCountTargetingRef: null,
    canonicalRulesetMatchCount: null,
    canonicalFreshnessRulesetMatchCount: null,
    canonicalRuleset: null,
    canonicalFreshnessRuleset: null,
    canonicalFloorSatisfied: false,
    freshnessFloorSatisfied: false,
    bypassObservationComplete: null,
    freshnessBypassObservationComplete: null,
    trustedBypassPolicyAvailable: false,
    bypassPolicySatisfied: false,
    freshnessBypassPolicySatisfied: false,
    independentReviewerReady: false,
    eligibleNonOwnerWriteReviewerCount: null,
    observedBranchRulesets: [],
    status: 'BLOCKED',
  };
}

export function classifyProviderReadFailure(error) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (/403|resource not accessible|forbidden/i.test(message)) return 'provider_read_forbidden';
  if (/401|bad credentials|requires authentication/i.test(message)) return 'provider_read_unauthenticated';
  if (/GITHUB_TOKEN is required/i.test(message)) return 'provider_read_token_missing';
  return 'provider_read_failed';
}

function writeReceipt(report) {
  mkdirSync('artifacts', { recursive: true });
  writeFileSync(RECEIPT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

async function githubGet(path, token) {
  const response = await fetch(`${API_ROOT}${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': API_VERSION,
      'User-Agent': 'founder-control-room-governance-preflight',
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = typeof body?.message === 'string' ? body.message : `HTTP ${response.status}`;
    throw new Error(`GitHub provider read failed for ${path}: HTTP ${response.status}: ${message}`);
  }
  return body;
}

async function listAll(path, token) {
  const results = [];
  for (let page = 1; page <= 20; page += 1) {
    const separator = path.includes('?') ? '&' : '?';
    const body = await githubGet(`${path}${separator}per_page=100&page=${page}`, token);
    if (!Array.isArray(body)) throw new Error(`Expected array from GitHub provider read: ${path}`);
    results.push(...body);
    if (body.length < 100) break;
  }
  return results;
}

export async function collectGovernancePreflight({ token, repository, targetRef = 'main', trustedGitHubAppId }) {
  if (!text(token)) throw new Error('GITHUB_TOKEN is required for governance preflight');
  const { owner, repo } = parseRepository(repository);
  const repositoryState = await githubGet(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
    token,
  );
  const defaultBranch = text(repositoryState?.default_branch) || targetRef;
  const rulesetSummaries = await listAll(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/rulesets?includes_parents=false`, token);
  const fullRulesets = [];
  for (const ruleset of rulesetSummaries) {
    if (ruleset?.id == null) continue;
    fullRulesets.push(await githubGet(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/rulesets/${encodeURIComponent(String(ruleset.id))}?includes_parents=false`,
      token,
    ));
  }
  const collaborators = await listAll(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/collaborators?affiliation=all`,
    token,
  );
  return buildReport({ repository, targetRef, defaultBranch, fullRulesets, collaborators, trustedGitHubAppId });
}

async function main() {
  const repository = process.env.GITHUB_REPOSITORY;
  const targetRef = process.env.FCR_GOVERNANCE_TARGET_REF || 'main';
  let report;
  let blocked = false;

  try {
    report = await collectGovernancePreflight({
      token: process.env.GITHUB_TOKEN,
      repository,
      targetRef,
      trustedGitHubAppId: process.env.GITHUB_APP_ID,
    });
    blocked = report.status === 'BLOCKED';
  } catch (error) {
    blocked = true;
    report = buildBlockedReport({
      repository,
      targetRef,
      reason: classifyProviderReadFailure(error),
    });
  }

  writeReceipt(report);

  console.log(JSON.stringify({
    contract: report.contract,
    repository: report.repository,
    targetRef: report.targetRef,
    defaultBranch: report.defaultBranch,
    status: report.status,
    observationComplete: report.observationComplete,
    blocker: report.blocker,
    activeRulesetCountTargetingRef: report.activeRulesetCountTargetingRef,
    canonicalRulesetMatchCount: report.canonicalRulesetMatchCount,
    canonicalFreshnessRulesetMatchCount: report.canonicalFreshnessRulesetMatchCount,
    canonicalFloorSatisfied: report.canonicalFloorSatisfied,
    freshnessFloorSatisfied: report.freshnessFloorSatisfied,
    bypassObservationComplete: report.bypassObservationComplete,
    freshnessBypassObservationComplete: report.freshnessBypassObservationComplete,
    trustedBypassPolicyAvailable: report.trustedBypassPolicyAvailable,
    bypassPolicySatisfied: report.bypassPolicySatisfied,
    freshnessBypassPolicySatisfied: report.freshnessBypassPolicySatisfied,
    independentReviewerReady: report.independentReviewerReady,
    eligibleNonOwnerWriteReviewerCount: report.eligibleNonOwnerWriteReviewerCount,
  }, null, 2));

  if (blocked) process.exitCode = 1;
}

const invokedAsScript = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedAsScript) {
  main().catch((error) => {
    const report = buildBlockedReport({
      repository: process.env.GITHUB_REPOSITORY,
      targetRef: process.env.FCR_GOVERNANCE_TARGET_REF || 'main',
      reason: classifyProviderReadFailure(error),
    });
    writeReceipt(report);
    console.error(JSON.stringify({ contract: CONTRACT, status: report.status, blocker: report.blocker }));
    process.exit(1);
  });
}
