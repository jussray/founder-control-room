import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const CONTRACT = 'fcr/github-governance-preflight@v1';
export const CANONICAL_RULESET_NAME = 'Founder Control Room main exact-head gate';
export const REQUIRED_CHECKS = ['Required Gate', 'Verify test-ledger contract'];

const API_VERSION = '2026-03-10';
const API_ROOT = 'https://api.github.com';

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

export function rulesetSnapshot(ruleset, targetRef = 'main') {
  const pull = ruleOfType(ruleset, 'pull_request');
  const status = ruleOfType(ruleset, 'required_status_checks');
  const statusChecks = Array.isArray(status?.parameters?.required_status_checks)
    ? status.parameters.required_status_checks
        .map((entry) => text(entry?.context))
        .filter(Boolean)
    : [];
  const bypassActors = Array.isArray(ruleset?.bypass_actors)
    ? ruleset.bypass_actors.map((actor) => ({
        actorType: text(actor?.actor_type),
        actorId: actor?.actor_id == null ? null : String(actor.actor_id),
        bypassMode: text(actor?.bypass_mode),
      }))
    : [];
  const targets = branchTargets(ruleset);
  const targetToken = `refs/heads/${targetRef}`;

  return {
    id: ruleset?.id == null ? '' : String(ruleset.id),
    name: text(ruleset?.name),
    enforcement: text(ruleset?.enforcement),
    target: text(ruleset?.target),
    targetRefs: targets,
    targetsRequestedRef: targets.includes(targetToken),
    requirePullRequest: Boolean(pull),
    requiredApprovingReviewCount: Number(pull?.parameters?.required_approving_review_count ?? 0),
    dismissStaleReviewsOnPush: pull?.parameters?.dismiss_stale_reviews_on_push === true,
    requireLastPushApproval: pull?.parameters?.require_last_push_approval === true,
    requiredReviewThreadResolution: pull?.parameters?.required_review_thread_resolution === true,
    strictRequiredStatusChecks: status?.parameters?.strict_required_status_checks_policy === true,
    requiredStatusCheckNames: statusChecks.sort(),
    blockForcePushes: Boolean(ruleOfType(ruleset, 'non_fast_forward')),
    blockDeletion: Boolean(ruleOfType(ruleset, 'deletion')),
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

export function canonicalFloorSatisfied(snapshot) {
  if (!snapshot) return false;
  const checks = new Set(snapshot.requiredStatusCheckNames);
  return snapshot.name === CANONICAL_RULESET_NAME
    && snapshot.enforcement === 'active'
    && snapshot.target === 'branch'
    && snapshot.targetsRequestedRef === true
    && snapshot.requirePullRequest === true
    && snapshot.requiredApprovingReviewCount >= 1
    && snapshot.dismissStaleReviewsOnPush === true
    && snapshot.requireLastPushApproval === true
    && snapshot.requiredReviewThreadResolution === true
    && snapshot.strictRequiredStatusChecks === true
    && REQUIRED_CHECKS.every((check) => checks.has(check))
    && snapshot.blockForcePushes === true
    && snapshot.blockDeletion === true;
}

export function buildReport({ repository, targetRef = 'main', fullRulesets, collaborators, canonicalName = CANONICAL_RULESET_NAME }) {
  const { owner } = parseRepository(repository);
  const snapshots = fullRulesets
    .filter((ruleset) => ruleset?.target === 'branch')
    .map((ruleset) => rulesetSnapshot(ruleset, targetRef));
  const activeTargetingRef = snapshots.filter((snapshot) =>
    snapshot.enforcement === 'active' && snapshot.targetsRequestedRef);
  const canonicalMatches = snapshots.filter((snapshot) => snapshot.name === canonicalName);
  const canonical = canonicalMatches[0] ?? null;
  const eligibleReviewers = collaborators.filter((collaborator) => collaboratorCanReview(collaborator, owner));

  return {
    contract: CONTRACT,
    repository,
    targetRef,
    canonicalRulesetName: canonicalName,
    observedAt: new Date().toISOString(),
    providerMutationPerformed: false,
    activeRulesetCountTargetingRef: activeTargetingRef.length,
    canonicalRulesetMatchCount: canonicalMatches.length,
    canonicalRuleset: canonical,
    canonicalFloorSatisfied: canonicalFloorSatisfied(canonical),
    independentReviewerReady: eligibleReviewers.length > 0,
    eligibleNonOwnerWriteReviewerCount: eligibleReviewers.length,
    observedBranchRulesets: snapshots,
    status:
      canonicalMatches.length === 1
      && activeTargetingRef.length === 1
      && canonicalFloorSatisfied(canonical)
      && eligibleReviewers.length > 0
        ? 'READY'
        : 'NOT_READY',
  };
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
    throw new Error(`GitHub provider read failed for ${path}: ${message}`);
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

export async function collectGovernancePreflight({ token, repository, targetRef = 'main' }) {
  if (!text(token)) throw new Error('GITHUB_TOKEN is required for governance preflight');
  const { owner, repo } = parseRepository(repository);
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
  return buildReport({ repository, targetRef, fullRulesets, collaborators });
}

async function main() {
  const report = await collectGovernancePreflight({
    token: process.env.GITHUB_TOKEN,
    repository: process.env.GITHUB_REPOSITORY,
    targetRef: process.env.FCR_GOVERNANCE_TARGET_REF || 'main',
  });

  mkdirSync('artifacts', { recursive: true });
  writeFileSync('artifacts/github-governance-preflight.json', `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify({
    contract: report.contract,
    repository: report.repository,
    targetRef: report.targetRef,
    status: report.status,
    activeRulesetCountTargetingRef: report.activeRulesetCountTargetingRef,
    canonicalRulesetMatchCount: report.canonicalRulesetMatchCount,
    canonicalFloorSatisfied: report.canonicalFloorSatisfied,
    independentReviewerReady: report.independentReviewerReady,
    eligibleNonOwnerWriteReviewerCount: report.eligibleNonOwnerWriteReviewerCount,
  }, null, 2));
}

const invokedAsScript = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedAsScript) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
