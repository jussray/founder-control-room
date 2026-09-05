import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  CHIEF_OWNER,
  CHIEF_REPOSITORY,
  EXACT_HEAD_RULESET_ID,
  EXPECTED_CHIEF_BASE_SHA,
  FOUNDER_GITHUB_USER_ID,
  GOVERNANCE_BOUNDARY_RULESET_ID,
} from './chief-proofmode-governance-witness.mjs';

export const PREFLIGHT_CONTRACT = 'fcr/chief-proofmode-governance-preflight@v1';
export const REQUIRED_APP_PERMISSIONS = Object.freeze({
  actions: 'read',
  administration: 'read',
  checks: 'write',
  contents: 'read',
  metadata: 'read',
  pull_requests: 'read',
});

const API_ROOT = 'https://api.github.com';
const API_VERSION = '2026-03-10';
const FULL_SHA = /^[0-9a-f]{40}$/i;
const POSITIVE_INTEGER = /^[1-9][0-9]*$/;
const RECEIPT_PATH = 'artifacts/chief-proofmode-governance-preflight.json';

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function lower(value) {
  return text(value).toLowerCase();
}

function numericId(value) {
  const raw = value == null ? '' : String(value).trim();
  return POSITIVE_INTEGER.test(raw) ? raw : null;
}

function permissionRank(value) {
  if (value === 'write') return 2;
  if (value === 'read') return 1;
  return 0;
}

function targetsMain(ruleset) {
  if (ruleset?.target !== 'branch' || ruleset?.enforcement !== 'active') return false;
  const include = ruleset?.conditions?.ref_name?.include;
  return Array.isArray(include)
    && (include.includes('~DEFAULT_BRANCH') || include.includes('refs/heads/main'));
}

function rulesetSummary(ruleset) {
  return {
    id: ruleset?.id == null ? null : Number(ruleset.id),
    name: text(ruleset?.name) || null,
    activeMain: targetsMain(ruleset),
    bypassObservationComplete: Array.isArray(ruleset?.bypass_actors),
    bypassActorCount: Array.isArray(ruleset?.bypass_actors) ? ruleset.bypass_actors.length : null,
  };
}

function violation(list, classification, detail = {}) {
  list.push({ classification, ...detail });
}

export function evaluateChiefGovernancePreflight({
  appId,
  trustedFcrMainSha,
  installation,
  repository,
  pullRequest,
  rulesets,
  actionsReadbackComplete,
  checksReadbackComplete,
}) {
  const violations = [];
  const expectedAppId = numericId(appId);
  const trustRootSha = lower(trustedFcrMainSha);
  const installationAppId = numericId(installation?.app_id);
  const installationAccountId = numericId(installation?.account?.id);
  const installationAccountLogin = lower(installation?.account?.login);
  const permissions = installation?.permissions && typeof installation.permissions === 'object'
    ? installation.permissions
    : {};

  if (!expectedAppId) violation(violations, 'trusted-app-id-invalid');
  if (!FULL_SHA.test(trustRootSha)) {
    violation(violations, 'trusted-fcr-main-sha-invalid', { observed: trustRootSha || null });
  }
  if (!numericId(installation?.id)) violation(violations, 'chief-app-installation-not-observed');
  if (expectedAppId && installationAppId !== expectedAppId) {
    violation(violations, 'chief-app-installation-app-id-mismatch', {
      expected: expectedAppId,
      observed: installationAppId,
    });
  }
  if (
    installationAccountId !== FOUNDER_GITHUB_USER_ID
    || installationAccountLogin !== CHIEF_OWNER
  ) {
    violation(violations, 'chief-app-installation-account-mismatch', {
      expectedLogin: CHIEF_OWNER,
      expectedId: FOUNDER_GITHUB_USER_ID,
      observedLogin: installationAccountLogin || null,
      observedId: installationAccountId,
    });
  }

  for (const [permission, required] of Object.entries(REQUIRED_APP_PERMISSIONS)) {
    const observed = text(permissions?.[permission]).toLowerCase() || 'none';
    if (permissionRank(observed) < permissionRank(required)) {
      violation(violations, 'chief-app-permission-insufficient', {
        permission,
        required,
        observed,
      });
    }
  }

  if (lower(repository?.full_name) !== CHIEF_REPOSITORY) {
    violation(violations, 'chief-repository-readback-mismatch', {
      expected: CHIEF_REPOSITORY,
      observed: lower(repository?.full_name) || null,
    });
  }
  if (lower(pullRequest?.base?.repo?.full_name) !== CHIEF_REPOSITORY
    || lower(pullRequest?.head?.repo?.full_name) !== CHIEF_REPOSITORY) {
    violation(violations, 'chief-pull-request-repository-mismatch');
  }
  if (pullRequest?.state !== 'open' || pullRequest?.merged === true) {
    violation(violations, 'chief-pull-request-not-open-unmerged');
  }
  if (pullRequest?.base?.ref !== 'main' || lower(pullRequest?.base?.sha) !== EXPECTED_CHIEF_BASE_SHA) {
    violation(violations, 'chief-main-moved', {
      expected: EXPECTED_CHIEF_BASE_SHA,
      observed: lower(pullRequest?.base?.sha) || null,
    });
  }
  if (!FULL_SHA.test(lower(pullRequest?.head?.sha))) {
    violation(violations, 'chief-pull-request-head-invalid');
  }
  if (actionsReadbackComplete !== true) violation(violations, 'chief-actions-readback-incomplete');
  if (checksReadbackComplete !== true) violation(violations, 'chief-checks-readback-incomplete');

  const activeMainRulesets = (Array.isArray(rulesets) ? rulesets : [])
    .filter(targetsMain)
    .map(rulesetSummary);
  const governanceBoundary = activeMainRulesets.find((item) => item.id === GOVERNANCE_BOUNDARY_RULESET_ID) ?? null;
  const exactHeadGate = activeMainRulesets.find((item) => item.id === EXACT_HEAD_RULESET_ID) ?? null;

  if (!governanceBoundary) {
    violation(violations, 'governance-boundary-not-observed', {
      expectedRulesetId: GOVERNANCE_BOUNDARY_RULESET_ID,
    });
  } else if (!governanceBoundary.bypassObservationComplete) {
    violation(violations, 'governance-boundary-bypass-observation-incomplete');
  }

  if (!exactHeadGate) {
    violation(violations, 'exact-head-ruleset-not-observed', {
      expectedRulesetId: EXACT_HEAD_RULESET_ID,
    });
  } else if (!exactHeadGate.bypassObservationComplete) {
    violation(violations, 'exact-head-bypass-observation-incomplete');
  } else if (exactHeadGate.bypassActorCount !== 0) {
    violation(violations, 'exact-head-ruleset-bypassable', {
      bypassActorCount: exactHeadGate.bypassActorCount,
    });
  }

  return {
    contract: PREFLIGHT_CONTRACT,
    ok: violations.length === 0,
    classification: violations.length === 0 ? 'READY_FOR_GOVERNANCE_MIGRATION' : 'BLOCKED',
    providerMutationPerformed: false,
    trustedFcrMainSha: FULL_SHA.test(trustRootSha) ? trustRootSha : null,
    chiefRepository: CHIEF_REPOSITORY,
    chiefPullRequestNumber: pullRequest?.number ?? null,
    chiefHeadSha: lower(pullRequest?.head?.sha) || null,
    app: {
      appId: expectedAppId,
      installationId: numericId(installation?.id),
      installationAccountLogin: installationAccountLogin || null,
      installationAccountId,
      repositorySelection: text(installation?.repository_selection) || null,
      permissions: Object.fromEntries(
        Object.keys(REQUIRED_APP_PERMISSIONS).map((permission) => [
          permission,
          text(permissions?.[permission]).toLowerCase() || 'none',
        ]),
      ),
    },
    readback: {
      repository: lower(repository?.full_name) || null,
      actionsReadbackComplete: actionsReadbackComplete === true,
      checksReadbackComplete: checksReadbackComplete === true,
      governanceBoundary,
      exactHeadGate,
    },
    violations,
  };
}

async function githubJson(path, token) {
  const response = await fetch(`${API_ROOT}${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': API_VERSION,
      'User-Agent': 'founder-control-room-chief-governance-preflight',
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = text(body?.message) || `HTTP ${response.status}`;
    throw new Error(`GitHub governance preflight failed for ${path}: HTTP ${response.status}: ${message}`);
  }
  return body;
}

async function detailedRulesets(token) {
  const summaries = await githubJson(
    `/repos/${CHIEF_OWNER}/chief-ai-machine/rulesets?includes_parents=true&per_page=100`,
    token,
  );
  if (!Array.isArray(summaries)) throw new Error('Chief ruleset summary read did not return an array');
  return Promise.all(summaries.map((ruleset) => {
    const id = numericId(ruleset?.id);
    if (!id) throw new Error('Chief ruleset summary returned an invalid id');
    return githubJson(`/repos/${CHIEF_OWNER}/chief-ai-machine/rulesets/${id}`, token);
  }));
}

function writeReceipt(report) {
  mkdirSync('artifacts', { recursive: true });
  writeFileSync(RECEIPT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

export async function runChiefGovernancePreflight(env = process.env) {
  const appId = text(env.GITHUB_APP_ID);
  const privateKey = text(env.GITHUB_PRIVATE_KEY);
  const trustedFcrMainSha = lower(env.EXPECTED_TRUSTED_MAIN_SHA);
  const prNumber = Number(env.CHIEF_PR_NUMBER ?? '143');

  if (!numericId(appId)) throw new Error('GITHUB_APP_ID must be numeric');
  if (!privateKey) throw new Error('GITHUB_PRIVATE_KEY is required');
  if (!FULL_SHA.test(trustedFcrMainSha)) throw new Error('EXPECTED_TRUSTED_MAIN_SHA must be an exact FCR main SHA');
  if (!Number.isSafeInteger(prNumber) || prNumber <= 0) throw new Error('CHIEF_PR_NUMBER must be a positive integer');

  const { createGitHubAppJwt, getGitHubInstallationToken } = await import('../dist/providers/githubAppAuth.js');
  const appJwt = createGitHubAppJwt(appId, privateKey);
  const installation = await githubJson(`/repos/${CHIEF_OWNER}/chief-ai-machine/installation`, appJwt);
  const installationToken = await getGitHubInstallationToken(appId, privateKey, CHIEF_REPOSITORY);

  const repository = await githubJson(`/repos/${CHIEF_OWNER}/chief-ai-machine`, installationToken);
  const pullRequest = await githubJson(`/repos/${CHIEF_OWNER}/chief-ai-machine/pulls/${prNumber}`, installationToken);
  const rulesets = await detailedRulesets(installationToken);
  const actionRuns = await githubJson(
    `/repos/${CHIEF_OWNER}/chief-ai-machine/actions/runs?per_page=1`,
    installationToken,
  );
  const headSha = lower(pullRequest?.head?.sha);
  if (!FULL_SHA.test(headSha)) throw new Error('Chief pull request did not expose an exact head SHA');
  const checkRuns = await githubJson(
    `/repos/${CHIEF_OWNER}/chief-ai-machine/commits/${headSha}/check-runs?per_page=1&filter=latest`,
    installationToken,
  );

  const report = evaluateChiefGovernancePreflight({
    appId,
    trustedFcrMainSha,
    installation,
    repository,
    pullRequest,
    rulesets,
    actionsReadbackComplete: Array.isArray(actionRuns?.workflow_runs),
    checksReadbackComplete: Array.isArray(checkRuns?.check_runs),
  });
  writeReceipt(report);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) {
    throw new Error(`Chief governance preflight blocked: ${report.violations.map((item) => item.classification).join(', ')}`);
  }
  return report;
}

const invokedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  runChiefGovernancePreflight().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
