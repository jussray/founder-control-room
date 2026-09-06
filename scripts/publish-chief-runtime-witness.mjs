import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const CHIEF_RUNTIME_WITNESS = Object.freeze({
  contract: 'fcr/chief-runtime-witness@v1',
  repository: 'jussray/chief-ai-machine',
  pullRequestNumber: 143,
  rulesetId: 20818149,
  rulesetName: 'Chief AI main exact-head gate',
  checkName: 'Verify candidate ProofMode runtime with Playwright',
  deploymentEnvironment: 'proofmode-access-admin',
  requiredDeploymentEnvironments: ['Cloudflare Production', 'proofmode-access-admin'],
});

const FULL_SHA = /^[0-9a-f]{40}$/;
const AUDITABLE_REFERENCE = /^[A-Za-z0-9._:-]{8,200}$/;
const IMMUTABLE_CHIEF_HOST = /^[0-9a-f]{8}-chief-ai\.mcgill-raylene\.workers\.dev$/i;
const ARTIFACT_PATH = 'artifacts/chief-runtime-witness.json';

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function required(env, name) {
  const value = text(env[name]);
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash('sha256').update(typeof value === 'string' ? value : stableJson(value)).digest('hex');
}

function normalizeTarget(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('CHIEF_RUNTIME_TARGET_URL must be a valid URL');
  }
  if (
    url.protocol !== 'https:'
    || url.username
    || url.password
    || url.search
    || url.hash
    || (url.pathname !== '/' && url.pathname !== '')
    || !IMMUTABLE_CHIEF_HOST.test(url.hostname)
  ) {
    throw new Error('CHIEF_RUNTIME_TARGET_URL must be one immutable Chief workers.dev preview origin');
  }
  return url.origin;
}

function deploymentPayloadObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch {
      return {};
    }
  }
  return {};
}

export function validateRuntimeReceipt(receipt, expected) {
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) {
    throw new Error('runtime receipt must be one JSON object');
  }
  if (receipt.schema !== 'fcr/chief-runtime-playwright@v1') {
    throw new Error('runtime receipt schema mismatch');
  }
  if (receipt.trustedFcrMainSha !== expected.trustedFcrMainSha) {
    throw new Error('runtime receipt trusted FCR main mismatch');
  }
  if (receipt.chiefCandidateSha !== expected.chiefCandidateSha) {
    throw new Error('runtime receipt Chief candidate mismatch');
  }
  if (receipt.targetOrigin !== expected.targetOrigin) {
    throw new Error('runtime receipt target mismatch');
  }
  if (receipt.versionVerified !== true || receipt.playwrightPassed !== true || receipt.proofModeVerified !== true) {
    throw new Error('runtime receipt is not fully verified');
  }
  if (!text(receipt.workflowRunUrl).startsWith('https://github.com/jussray/founder-control-room/actions/runs/')) {
    throw new Error('runtime receipt workflowRunUrl is not an FCR Actions run');
  }
  if (!text(receipt.generatedAt) || Number.isNaN(Date.parse(receipt.generatedAt))) {
    throw new Error('runtime receipt generatedAt is invalid');
  }
  return receipt;
}

export function validateChiefRuleset(readback) {
  if (!readback || typeof readback !== 'object') throw new Error('Chief ruleset readback missing');
  if (Number(readback.id) !== CHIEF_RUNTIME_WITNESS.rulesetId) throw new Error('Chief ruleset id drifted');
  if (readback.name !== CHIEF_RUNTIME_WITNESS.rulesetName) throw new Error('Chief ruleset name drifted');
  if (readback.target !== 'branch' || readback.enforcement !== 'active') throw new Error('Chief ruleset is not active on branches');
  if (!Array.isArray(readback.bypass_actors) || readback.bypass_actors.length !== 0) {
    throw new Error('Chief ruleset must preserve zero bypass actors');
  }
  const include = readback.conditions?.ref_name?.include;
  if (!Array.isArray(include) || !include.includes('~DEFAULT_BRANCH')) {
    throw new Error('Chief ruleset no longer targets default branch');
  }
  const rules = Array.isArray(readback.rules) ? readback.rules : [];
  const deploymentRule = rules.find((rule) => rule?.type === 'required_deployments');
  const deployments = deploymentRule?.parameters?.required_deployment_environments;
  if (!Array.isArray(deployments)) throw new Error('Chief required deployments are unobservable');
  for (const expected of CHIEF_RUNTIME_WITNESS.requiredDeploymentEnvironments) {
    if (!deployments.includes(expected)) throw new Error(`Chief required deployment missing: ${expected}`);
  }
  const statusRule = rules.find((rule) => rule?.type === 'required_status_checks');
  const statuses = statusRule?.parameters?.required_status_checks;
  if (!Array.isArray(statuses)) throw new Error('Chief required status checks are unobservable');
  if (statuses.some((item) => item?.context === CHIEF_RUNTIME_WITNESS.checkName)) {
    throw new Error('reserved candidate runtime context must remain unbound in ruleset #208');
  }
  return readback;
}

export function validateChiefRulesetUnchanged(before, after) {
  const initial = validateChiefRuleset(before);
  const current = validateChiefRuleset(after);
  if (sha256(initial) !== sha256(current)) {
    throw new Error('Chief ruleset changed during runtime witness publication');
  }
  return current;
}

export function validateChiefPullRequest(readback, expectedSha) {
  if (!readback || typeof readback !== 'object') throw new Error('Chief PR readback missing');
  if (Number(readback.number) !== CHIEF_RUNTIME_WITNESS.pullRequestNumber) throw new Error('Chief PR number drifted');
  if (readback.state !== 'open') throw new Error('Chief PR is not open');
  if (readback.base?.ref !== 'main') throw new Error('Chief PR no longer targets main');
  if (text(readback.head?.repo?.full_name || readback.head?.repo?.name) !== CHIEF_RUNTIME_WITNESS.repository
      && text(readback.head?.repo?.name) !== 'chief-ai-machine') {
    throw new Error('Chief PR head repository drifted');
  }
  if (text(readback.head?.sha).toLowerCase() !== expectedSha) throw new Error('Chief PR head moved');
  return readback;
}

function requireInstallationAuthority(observation, expectedAppId) {
  if (!observation || typeof observation !== 'object') throw new Error('GitHub App installation observation missing');
  if (text(observation.repository).toLowerCase() !== CHIEF_RUNTIME_WITNESS.repository) {
    throw new Error('GitHub App installation is not scoped to Chief');
  }
  if (text(observation.appId) !== expectedAppId) throw new Error('GitHub App id mismatch');
  const permissions = observation.permissions || {};
  if (permissions.checks !== 'write') throw new Error('GitHub App lacks checks:write');
  if (permissions.deployments !== 'write') throw new Error('GitHub App lacks deployments:write');
  return observation;
}

export function validateInstallationUnchanged(before, after, expectedAppId) {
  const initial = requireInstallationAuthority(before, expectedAppId);
  const current = requireInstallationAuthority(after, expectedAppId);
  if (text(initial.installationId) !== text(current.installationId)) {
    throw new Error('GitHub App installation identity changed during runtime witness publication');
  }
  if (text(initial.repositorySelection) !== text(current.repositorySelection)) {
    throw new Error('GitHub App repository selection changed during runtime witness publication');
  }
  return current;
}

async function githubJson(fetchFn, token, endpoint, options = {}) {
  const response = await fetchFn(`https://api.github.com${endpoint}`, {
    method: options.method || 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'content-type': 'application/json',
      'x-github-api-version': '2022-11-28',
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const raw = await response.text();
  let data = null;
  if (raw) {
    try { data = JSON.parse(raw); } catch { data = raw; }
  }
  if (!response.ok) {
    const detail = typeof data === 'string' ? data.slice(0, 1_000) : JSON.stringify(data).slice(0, 1_000);
    throw new Error(`GitHub ${options.method || 'GET'} ${endpoint} failed with ${response.status}${detail ? `: ${detail}` : ''}`);
  }
  return data;
}

function matchingCheck(runs, appId, sha, receiptHash) {
  return (Array.isArray(runs) ? runs : []).find((run) =>
    run?.name === CHIEF_RUNTIME_WITNESS.checkName
    && run?.status === 'completed'
    && run?.conclusion === 'success'
    && text(run?.head_sha).toLowerCase() === sha
    && text(run?.external_id).toLowerCase() === receiptHash
    && String(run?.app?.id ?? '') === appId
  ) || null;
}

function matchingDeployment(deployments, sha, receiptHash) {
  return (Array.isArray(deployments) ? deployments : []).find((deployment) => {
    const payload = deploymentPayloadObject(deployment?.payload);
    return text(deployment?.sha || deployment?.ref).toLowerCase() === sha
      && deployment?.environment === CHIEF_RUNTIME_WITNESS.deploymentEnvironment
      && payload.contract === CHIEF_RUNTIME_WITNESS.contract
      && payload.receiptHash === receiptHash;
  }) || null;
}

function matchingDeploymentStatus(statuses, targetOrigin, receiptHash) {
  return (Array.isArray(statuses) ? statuses : []).find((status) =>
    status?.state === 'success'
    && status?.environment === CHIEF_RUNTIME_WITNESS.deploymentEnvironment
    && text(status?.environment_url) === targetOrigin
    && text(status?.description).includes(receiptHash.slice(0, 12))
  ) || null;
}

async function writeArtifact(value, artifactPath = ARTIFACT_PATH) {
  await fs.mkdir(path.dirname(artifactPath), { recursive: true });
  await fs.writeFile(artifactPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export async function publishChiefRuntimeWitness({
  env = process.env,
  fetchFn = fetch,
  getInstallationTokenFn,
  observeInstallationFn,
  readFileFn = fs.readFile,
  writeArtifactFn = writeArtifact,
} = {}) {
  const trustedFcrMainSha = required(env, 'EXPECTED_TRUSTED_MAIN_SHA').toLowerCase();
  const chiefCandidateSha = required(env, 'CHIEF_CANDIDATE_SHA').toLowerCase();
  const targetOrigin = normalizeTarget(required(env, 'CHIEF_RUNTIME_TARGET_URL'));
  const approvalReference = required(env, 'RUNTIME_WITNESS_APPROVAL_REFERENCE');
  const runtimeReceiptPath = required(env, 'RUNTIME_RECEIPT_PATH');
  const appId = required(env, 'GITHUB_APP_ID');
  const privateKey = required(env, 'GITHUB_PRIVATE_KEY');

  if (!FULL_SHA.test(trustedFcrMainSha)) throw new Error('EXPECTED_TRUSTED_MAIN_SHA must be a lowercase full commit SHA');
  if (!FULL_SHA.test(chiefCandidateSha)) throw new Error('CHIEF_CANDIDATE_SHA must be a lowercase full commit SHA');
  if (!AUDITABLE_REFERENCE.test(approvalReference)) throw new Error('RUNTIME_WITNESS_APPROVAL_REFERENCE must use 8-200 auditable characters');
  if (!/^\d+$/.test(appId)) throw new Error('GITHUB_APP_ID must be numeric');

  const receiptRaw = await readFileFn(runtimeReceiptPath, 'utf8');
  const runtimeReceipt = validateRuntimeReceipt(JSON.parse(receiptRaw), {
    trustedFcrMainSha,
    chiefCandidateSha,
    targetOrigin,
  });
  const receiptHash = sha256(runtimeReceipt);

  if (!getInstallationTokenFn || !observeInstallationFn) {
    const auth = await import('../dist/providers/githubAppAuth.js');
    getInstallationTokenFn ||= auth.getGitHubInstallationToken;
    observeInstallationFn ||= auth.observeGitHubRepositoryInstallation;
  }

  const installation = requireInstallationAuthority(
    await observeInstallationFn(appId, privateKey, CHIEF_RUNTIME_WITNESS.repository),
    appId,
  );
  const token = await getInstallationTokenFn(appId, privateKey, CHIEF_RUNTIME_WITNESS.repository);

  validateChiefPullRequest(
    await githubJson(fetchFn, token, `/repos/jussray/chief-ai-machine/pulls/${CHIEF_RUNTIME_WITNESS.pullRequestNumber}`),
    chiefCandidateSha,
  );
  const initialRuleset = validateChiefRuleset(
    await githubJson(fetchFn, token, `/repos/jussray/chief-ai-machine/rulesets/${CHIEF_RUNTIME_WITNESS.rulesetId}`),
  );

  const checkEndpoint = `/repos/jussray/chief-ai-machine/commits/${chiefCandidateSha}/check-runs?per_page=100&filter=latest`;
  let checkPayload = await githubJson(fetchFn, token, checkEndpoint);
  let check = matchingCheck(checkPayload?.check_runs, appId, chiefCandidateSha, receiptHash);

  if (!check) {
    await githubJson(fetchFn, token, '/repos/jussray/chief-ai-machine/check-runs', {
      method: 'POST',
      body: {
        name: CHIEF_RUNTIME_WITNESS.checkName,
        head_sha: chiefCandidateSha,
        status: 'completed',
        conclusion: 'success',
        external_id: receiptHash,
        details_url: text(runtimeReceipt.workflowRunUrl),
        output: {
          title: 'Trusted FCR ProofMode runtime witness',
          summary: [
            `Exact Chief candidate: ${chiefCandidateSha}`,
            `Immutable preview: ${targetOrigin}`,
            `Trusted FCR main: ${trustedFcrMainSha}`,
            `Runtime receipt: sha256:${receiptHash}`,
            'Exact /version and protected ProofMode Playwright passed.',
            'This check grants no merge, deploy, ruleset-mutation, or bypass authority.',
          ].join('\n'),
        },
      },
    });
    checkPayload = await githubJson(fetchFn, token, checkEndpoint);
    check = matchingCheck(checkPayload?.check_runs, appId, chiefCandidateSha, receiptHash);
    if (!check) throw new Error('trusted Chief runtime Check Run readback missing');
  }

  const deploymentListEndpoint = `/repos/jussray/chief-ai-machine/deployments?sha=${encodeURIComponent(chiefCandidateSha)}&environment=${encodeURIComponent(CHIEF_RUNTIME_WITNESS.deploymentEnvironment)}&per_page=100`;
  let deployments = await githubJson(fetchFn, token, deploymentListEndpoint);
  let deployment = matchingDeployment(deployments, chiefCandidateSha, receiptHash);
  if (!deployment) {
    deployment = await githubJson(fetchFn, token, '/repos/jussray/chief-ai-machine/deployments', {
      method: 'POST',
      body: {
        ref: chiefCandidateSha,
        task: 'proofmode-runtime-evidence',
        auto_merge: false,
        required_contexts: [],
        environment: CHIEF_RUNTIME_WITNESS.deploymentEnvironment,
        description: 'Trusted FCR exact-head ProofMode runtime evidence',
        transient_environment: true,
        production_environment: false,
        payload: {
          contract: CHIEF_RUNTIME_WITNESS.contract,
          receiptHash,
          trustedFcrMainSha,
          chiefCandidateSha,
        },
      },
    });
  }
  if (!deployment?.id) throw new Error('trusted Chief runtime deployment id missing');

  const statusEndpoint = `/repos/jussray/chief-ai-machine/deployments/${encodeURIComponent(String(deployment.id))}/statuses?per_page=100`;
  let statuses = await githubJson(fetchFn, token, statusEndpoint);
  let deploymentStatus = matchingDeploymentStatus(statuses, targetOrigin, receiptHash);
  if (!deploymentStatus) {
    await githubJson(fetchFn, token, `/repos/jussray/chief-ai-machine/deployments/${encodeURIComponent(String(deployment.id))}/statuses`, {
      method: 'POST',
      body: {
        state: 'success',
        description: `FCR runtime witness ${receiptHash.slice(0, 12)}`,
        environment: CHIEF_RUNTIME_WITNESS.deploymentEnvironment,
        environment_url: targetOrigin,
        auto_inactive: false,
      },
    });
    statuses = await githubJson(fetchFn, token, statusEndpoint);
    deploymentStatus = matchingDeploymentStatus(statuses, targetOrigin, receiptHash);
    if (!deploymentStatus) throw new Error('trusted Chief runtime deployment-status readback missing');
  }

  const finalInstallation = validateInstallationUnchanged(
    installation,
    await observeInstallationFn(appId, privateKey, CHIEF_RUNTIME_WITNESS.repository),
    appId,
  );
  validateChiefPullRequest(
    await githubJson(fetchFn, token, `/repos/jussray/chief-ai-machine/pulls/${CHIEF_RUNTIME_WITNESS.pullRequestNumber}`),
    chiefCandidateSha,
  );
  validateChiefRulesetUnchanged(
    initialRuleset,
    await githubJson(fetchFn, token, `/repos/jussray/chief-ai-machine/rulesets/${CHIEF_RUNTIME_WITNESS.rulesetId}`),
  );

  const artifact = {
    schema: CHIEF_RUNTIME_WITNESS.contract,
    status: 'verified-published',
    generatedAt: new Date().toISOString(),
    trustedFcrMainSha,
    chiefCandidateSha,
    targetOrigin,
    receiptHash,
    approvalReferenceReceipt: `sha256:${sha256(approvalReference)}`,
    githubApp: {
      appId,
      installationId: text(finalInstallation.installationId),
      repositorySelection: text(finalInstallation.repositorySelection),
      checksPermission: finalInstallation.permissions?.checks ?? null,
      deploymentsPermission: finalInstallation.permissions?.deployments ?? null,
    },
    check: {
      name: CHIEF_RUNTIME_WITNESS.checkName,
      id: String(check.id),
      issuerAppId: String(check.app?.id ?? ''),
    },
    deployment: {
      environment: CHIEF_RUNTIME_WITNESS.deploymentEnvironment,
      id: String(deployment.id),
      statusId: String(deploymentStatus.id ?? ''),
      state: deploymentStatus.state,
    },
    authority: {
      merge: false,
      deploy: false,
      rulesetMutation: false,
      bypass: false,
    },
  };
  await writeArtifactFn(artifact);
  return artifact;
}

async function direct() {
  let stage = 'publish';
  try {
    const artifact = await publishChiefRuntimeWitness();
    console.log(JSON.stringify(artifact, null, 2));
  } catch (error) {
    stage = error instanceof Error ? error.message : stage;
    try {
      await writeArtifact({
        schema: CHIEF_RUNTIME_WITNESS.contract,
        status: 'failed',
        generatedAt: new Date().toISOString(),
        failure: { summary: String(stage).slice(0, 500) },
        authority: { merge: false, deploy: false, rulesetMutation: false, bypass: false },
      });
    } catch {
      // Best-effort sanitized failure artifact only.
    }
    throw error;
  }
}

const isDirect = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirect) await direct();