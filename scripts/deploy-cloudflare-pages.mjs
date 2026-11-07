import { mkdir, writeFile, appendFile } from 'node:fs/promises';

const DEFAULT_PROJECT = 'founder-control-room';
const DEFAULT_BRANCH = 'main';
const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;
const DEFAULT_POLL_MS = 5_000;
const TERMINAL_FAILURES = new Set(['failure', 'failed', 'canceled', 'cancelled']);

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function deploymentMetadata(deployment) {
  return deployment?.deployment_trigger?.metadata ?? {};
}

export function isNewExactProductionHookDeployment(
  deployment,
  { baselineIds, expectedSha, projectName = DEFAULT_PROJECT, branch = DEFAULT_BRANCH },
) {
  const metadata = deploymentMetadata(deployment);
  return Boolean(
    deployment?.id
      && !baselineIds.has(deployment.id)
      && deployment.project_name === projectName
      && deployment.environment === 'production'
      && deployment.deployment_trigger?.type === 'deploy_hook'
      && metadata.branch === branch
      && metadata.commit_hash === expectedSha,
  );
}

export function safeDeploymentSummary(deployment) {
  const metadata = deploymentMetadata(deployment);
  return {
    id: deployment?.id ?? null,
    createdOn: deployment?.created_on ?? null,
    environment: deployment?.environment ?? null,
    triggerType: deployment?.deployment_trigger?.type ?? null,
    branch: metadata.branch ?? null,
    commitHash: metadata.commit_hash ?? null,
    stage: deployment?.latest_stage?.name ?? null,
    status: deployment?.latest_stage?.status ?? null,
    url: deployment?.url ?? null,
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

  if (!response.ok) {
    throw new Error(`Cloudflare Pages API returned HTTP ${response.status}`);
  }

  const payload = await response.json();
  if (!payload?.success || !Array.isArray(payload.result) && !payload?.result) {
    throw new Error('Cloudflare Pages API returned an unsuccessful response');
  }
  return payload.result;
}

async function listDeployments(apiBase, token) {
  const result = await cloudflareRequest(apiBase, token);
  if (!Array.isArray(result)) {
    throw new Error('Cloudflare Pages deployments response was not a list');
  }
  return result;
}

async function getDeployment(apiBase, deploymentId, token) {
  return cloudflareRequest(`${apiBase}/${encodeURIComponent(deploymentId)}`, token);
}

async function triggerDeployHook(hookUrl) {
  let parsed;
  try {
    parsed = new URL(hookUrl);
  } catch {
    throw new Error('CLOUDFLARE_DEPLOY_HOOK_URL must be a valid URL');
  }
  if (parsed.protocol !== 'https:') {
    throw new Error('CLOUDFLARE_DEPLOY_HOOK_URL must use HTTPS');
  }

  const response = await fetch(hookUrl, {
    method: 'POST',
    redirect: 'error',
  });
  if (!response.ok) {
    throw new Error(`Cloudflare Pages deploy hook returned HTTP ${response.status}`);
  }
}

async function writeReceipt(receipt) {
  const outputDirectory = 'test-results';
  const outputPath = `${outputDirectory}/cloudflare-pages-deployment.json`;
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');

  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) {
    await appendFile(
      summaryPath,
      [
        '## Cloudflare Pages exact-SHA receipt',
        '',
        `- Project: \`${receipt.projectName}\``,
        `- Deployment ID: \`${receipt.deployment.id}\``,
        `- Exact SHA: \`${receipt.expectedSha}\``,
        `- Trigger: \`${receipt.deployment.triggerType}\``,
        `- Branch: \`${receipt.deployment.branch}\``,
        `- Environment: \`${receipt.deployment.environment}\``,
        `- Status: \`${receipt.deployment.status}\``,
        '',
      ].join('\n'),
      'utf8',
    );
  }
}

export async function deployAndVerifyPages({
  accountId,
  apiToken,
  hookUrl,
  expectedSha,
  projectName = DEFAULT_PROJECT,
  branch = DEFAULT_BRANCH,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  pollMs = DEFAULT_POLL_MS,
}) {
  if (!/^[0-9a-f]{40}$/.test(expectedSha)) {
    throw new Error('EXPECTED_HEAD_SHA must be a lowercase 40-character commit SHA');
  }

  const apiBase = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/pages/projects/${encodeURIComponent(projectName)}/deployments`;
  const baseline = await listDeployments(apiBase, apiToken);
  const baselineIds = new Set(baseline.map((deployment) => deployment?.id).filter(Boolean));

  await triggerDeployHook(hookUrl);

  const deadline = Date.now() + timeoutMs;
  const observed = new Map();
  let candidate = null;

  while (Date.now() < deadline && !candidate) {
    const deployments = await listDeployments(apiBase, apiToken);
    for (const deployment of deployments) {
      if (!deployment?.id || baselineIds.has(deployment.id)) continue;
      const summary = safeDeploymentSummary(deployment);
      observed.set(deployment.id, summary);
      if (
        isNewExactProductionHookDeployment(deployment, {
          baselineIds,
          expectedSha,
          projectName,
          branch,
        })
      ) {
        candidate = deployment;
        break;
      }
    }
    if (!candidate) await sleep(pollMs);
  }

  if (!candidate) {
    const summaries = [...observed.values()].slice(0, 10);
    throw new Error(
      `No new production deploy-hook deployment matched exact SHA ${expectedSha}. Observed: ${JSON.stringify(summaries)}`,
    );
  }

  let current = candidate;
  while (Date.now() < deadline) {
    current = await getDeployment(apiBase, candidate.id, apiToken);
    const status = String(current?.latest_stage?.status ?? '').toLowerCase();

    if (current?.is_skipped) {
      throw new Error(`Cloudflare Pages deployment ${candidate.id} was skipped`);
    }
    if (status === 'success') {
      const summary = safeDeploymentSummary(current);
      if (
        !isNewExactProductionHookDeployment(current, {
          baselineIds,
          expectedSha,
          projectName,
          branch,
        })
      ) {
        throw new Error('Cloudflare Pages deployment identity drifted during verification');
      }

      const receipt = {
        version: 1,
        verified: true,
        projectName,
        expectedSha,
        verifiedAt: new Date().toISOString(),
        deployment: summary,
      };
      await writeReceipt(receipt);
      return receipt;
    }
    if (TERMINAL_FAILURES.has(status)) {
      throw new Error(`Cloudflare Pages deployment ${candidate.id} ended with status ${status}`);
    }

    await sleep(pollMs);
  }

  throw new Error(`Timed out waiting for Cloudflare Pages deployment ${candidate.id}`);
}

async function main() {
  const receipt = await deployAndVerifyPages({
    accountId: requiredEnv('CLOUDFLARE_ACCOUNT_ID'),
    apiToken: requiredEnv('CLOUDFLARE_API_TOKEN'),
    hookUrl: requiredEnv('CLOUDFLARE_DEPLOY_HOOK_URL'),
    expectedSha: requiredEnv('EXPECTED_HEAD_SHA'),
    projectName: process.env.CLOUDFLARE_PAGES_PROJECT?.trim() || DEFAULT_PROJECT,
    branch: process.env.CLOUDFLARE_PAGES_BRANCH?.trim() || DEFAULT_BRANCH,
  });

  console.log(
    `Verified Cloudflare Pages deployment ${receipt.deployment.id} for exact SHA ${receipt.expectedSha}.`,
  );
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Cloudflare Pages exact-SHA deploy failed: ${message}`);
    process.exitCode = 1;
  });
}
