import { appendFile, mkdir, writeFile } from 'node:fs/promises';

const DEFAULT_WORKER = 'founder-control-room';
const DEFAULT_PAGES_PROJECT = 'founder-control-room';
const DEFAULT_PAGES_BRANCH = 'main';
const SHA_RE = /^[0-9a-f]{40}$/;

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function deploymentMetadata(deployment) {
  return deployment?.deployment_trigger?.metadata ?? {};
}

export function selectActiveWorkerDeployment(payload) {
  const deployments = payload?.deployments;
  if (!Array.isArray(deployments) || deployments.length === 0) {
    throw new Error('Cloudflare Worker API returned no active deployment');
  }

  const deployment = deployments[0];
  const versions = deployment?.versions;
  if (!deployment?.id || !Array.isArray(versions) || versions.length === 0) {
    throw new Error('Cloudflare Worker active deployment is missing rollback identity');
  }

  const safeVersions = versions.map((version) => {
    const percentage = Number(version?.percentage);
    if (!version?.version_id || !Number.isFinite(percentage) || percentage <= 0 || percentage > 100) {
      throw new Error('Cloudflare Worker active deployment contains an invalid version target');
    }
    return { versionId: version.version_id, percentage };
  });

  const total = safeVersions.reduce((sum, version) => sum + version.percentage, 0);
  if (Math.abs(total - 100) > 0.001) {
    throw new Error(`Cloudflare Worker active deployment traffic totals ${total}, expected 100`);
  }

  return {
    deploymentId: deployment.id,
    createdOn: deployment.created_on ?? null,
    source: deployment.source ?? null,
    strategy: deployment.strategy ?? null,
    versions: safeVersions,
  };
}

export function selectPagesRollbackDeployment(deployments, {
  projectName = DEFAULT_PAGES_PROJECT,
  branch = DEFAULT_PAGES_BRANCH,
} = {}) {
  if (!Array.isArray(deployments)) {
    throw new Error('Cloudflare Pages deployments response was not a list');
  }

  const deployment = deployments.find((candidate) => {
    const metadata = deploymentMetadata(candidate);
    const status = String(candidate?.latest_stage?.status ?? '').toLowerCase();
    return candidate?.id
      && candidate.project_name === projectName
      && candidate.environment === 'production'
      && metadata.branch === branch
      && status === 'success'
      && !candidate.is_skipped;
  });

  if (!deployment) {
    throw new Error('Cloudflare Pages has no successful production deployment eligible for rollback');
  }

  const metadata = deploymentMetadata(deployment);
  return {
    deploymentId: deployment.id,
    createdOn: deployment.created_on ?? null,
    branch: metadata.branch ?? null,
    commitHash: metadata.commit_hash ?? null,
    triggerType: deployment.deployment_trigger?.type ?? null,
    url: deployment.url ?? null,
  };
}

export function buildRollbackReceipt({
  intendedReleaseSha,
  workerName,
  workerLiveGitSha,
  workerDeployment,
  pagesProject,
  pagesDeployment,
  capturedAt = new Date().toISOString(),
}) {
  if (!SHA_RE.test(intendedReleaseSha)) {
    throw new Error('intendedReleaseSha must be a lowercase 40-character commit SHA');
  }
  if (!SHA_RE.test(workerLiveGitSha)) {
    throw new Error('workerLiveGitSha must be a lowercase 40-character commit SHA');
  }
  if (!workerDeployment?.deploymentId || !Array.isArray(workerDeployment.versions) || workerDeployment.versions.length === 0) {
    throw new Error('workerDeployment is missing a rollback target');
  }
  if (!pagesDeployment?.deploymentId) {
    throw new Error('pagesDeployment is missing a rollback target');
  }

  return {
    contract: 'fcr-production-rollback-receipt@v1',
    capturedAt,
    intendedReleaseSha,
    mutationPerformed: false,
    worker: {
      name: workerName,
      liveGitSha: workerLiveGitSha,
      activeDeployment: workerDeployment,
      rollback: {
        mechanism: 'cloudflare-worker-version-deployment',
        versions: workerDeployment.versions,
      },
    },
    pages: {
      project: pagesProject,
      activeDeployment: pagesDeployment,
      rollback: {
        mechanism: 'cloudflare-pages-deployment',
        deploymentId: pagesDeployment.deploymentId,
      },
    },
  };
}

async function cloudflareRequest(url, token) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
    redirect: 'error',
  });
  if (!response.ok) throw new Error(`Cloudflare API returned HTTP ${response.status}`);

  const payload = await response.json();
  if (!payload?.success) throw new Error('Cloudflare API returned an unsuccessful response');
  return payload.result;
}

async function readWorkerLiveGitSha(deployUrl) {
  const base = deployUrl.replace(/\/$/, '');
  const response = await fetch(`${base}/version`, {
    headers: { Accept: 'application/json' },
    redirect: 'error',
  });
  if (!response.ok) throw new Error(`Worker /version returned HTTP ${response.status}`);
  const body = await response.json();
  if (body?.service !== 'founder-control-room' || !SHA_RE.test(body?.gitSha ?? '')) {
    throw new Error('Worker /version did not return a valid FCR release identity');
  }
  return body.gitSha;
}

async function writeReceipt(receipt) {
  const outputDirectory = 'test-results';
  const outputPath = `${outputDirectory}/production-rollback-receipt.json`;
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');

  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(
      process.env.GITHUB_STEP_SUMMARY,
      [
        '## Pre-deploy rollback receipt',
        '',
        `- Intended release SHA: \`${receipt.intendedReleaseSha}\``,
        `- Current Worker SHA: \`${receipt.worker.liveGitSha}\``,
        `- Worker deployment ID: \`${receipt.worker.activeDeployment.deploymentId}\``,
        `- Worker rollback version(s): ${receipt.worker.rollback.versions.map((version) => `\`${version.versionId}@${version.percentage}%\``).join(', ')}`,
        `- Pages deployment ID: \`${receipt.pages.activeDeployment.deploymentId}\``,
        `- Pages current SHA: \`${receipt.pages.activeDeployment.commitHash ?? 'unknown'}\``,
        '- Mutation performed by this step: `false`',
        '',
      ].join('\n'),
      'utf8',
    );
  }
}

export async function captureProductionRollbackReceipt({
  accountId,
  apiToken,
  deployUrl,
  intendedReleaseSha,
  workerName = DEFAULT_WORKER,
  pagesProject = DEFAULT_PAGES_PROJECT,
  pagesBranch = DEFAULT_PAGES_BRANCH,
}) {
  const workerApi = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/workers/scripts/${encodeURIComponent(workerName)}/deployments`;
  const pagesApi = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/pages/projects/${encodeURIComponent(pagesProject)}/deployments`;

  const [workerResult, pagesResult, workerLiveGitSha] = await Promise.all([
    cloudflareRequest(workerApi, apiToken),
    cloudflareRequest(pagesApi, apiToken),
    readWorkerLiveGitSha(deployUrl),
  ]);

  const receipt = buildRollbackReceipt({
    intendedReleaseSha,
    workerName,
    workerLiveGitSha,
    workerDeployment: selectActiveWorkerDeployment(workerResult),
    pagesProject,
    pagesDeployment: selectPagesRollbackDeployment(pagesResult, { projectName: pagesProject, branch: pagesBranch }),
  });

  await writeReceipt(receipt);
  return receipt;
}

async function main() {
  const receipt = await captureProductionRollbackReceipt({
    accountId: requiredEnv('CLOUDFLARE_ACCOUNT_ID'),
    apiToken: requiredEnv('CLOUDFLARE_API_TOKEN'),
    deployUrl: requiredEnv('DEPLOY_URL'),
    intendedReleaseSha: requiredEnv('EXPECTED_HEAD_SHA'),
    workerName: process.env.CLOUDFLARE_WORKER_NAME?.trim() || DEFAULT_WORKER,
    pagesProject: process.env.CLOUDFLARE_PAGES_PROJECT?.trim() || DEFAULT_PAGES_PROJECT,
    pagesBranch: process.env.CLOUDFLARE_PAGES_BRANCH?.trim() || DEFAULT_PAGES_BRANCH,
  });

  console.log(`Captured rollback targets before release ${receipt.intendedReleaseSha}.`);
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  main().catch((error) => {
    console.error(`Production rollback receipt capture failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
