#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const RECEIPT_KIND = 'fcr/worker-build-authority-receipt@v1';
const REPOSITORY = 'jussray/founder-control-room';
const CONFIG_PATH = 'wrangler.worker.toml';
const EXPECTED_WORKER = 'founder-control-room';
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const receiptPath =
  process.env.FCR_BUILD_AUTHORITY_RECEIPT_PATH?.trim() ||
  'test-results/fcr-build-authority.json';

function gitHead() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return null;
  }
}

async function writeReceipt(receipt) {
  await mkdir(dirname(receiptPath), { recursive: true });
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
}

const command = process.env.WRANGLER_COMMAND?.trim() || 'unknown';
const workersCi = process.env.WORKERS_CI === '1';
const githubActions = process.env.GITHUB_ACTIONS === 'true';
const githubWorkflow = process.env.GITHUB_WORKFLOW?.trim() || null;
const githubEvent = process.env.GITHUB_EVENT_NAME?.trim() || null;
const githubEventSha = process.env.GITHUB_SHA?.trim() || null;
const workersCommit = process.env.WORKERS_CI_COMMIT_SHA?.trim() || null;
const workersBranch = process.env.WORKERS_CI_BRANCH?.trim() || null;
const workersBuildUuid = process.env.WORKERS_CI_BUILD_UUID?.trim() || null;
const checkedOutSha = gitHead();

const config = await readFile(CONFIG_PATH, 'utf8');
const workerName = config.match(/^name\s*=\s*"([^"]+)"\s*$/m)?.[1] ?? null;

let executionContext = 'local-or-unknown';
let sourceSha = checkedOutSha;
let sourceBranch = null;
let buildUuid = null;
let authorityDecision = 'allow';
let productionPromotionAuthorized = false;
let error = null;

if (workerName !== EXPECTED_WORKER) {
  authorityDecision = 'block';
  error = `WORKER_BUILD_AUTHORITY_BLOCKED: ${CONFIG_PATH} must target ${EXPECTED_WORKER}; observed ${workerName || 'missing'}.`;
} else if (workersCi) {
  executionContext = 'cloudflare-workers-builds';
  sourceSha = workersCommit;
  sourceBranch = workersBranch;
  buildUuid = workersBuildUuid;

  if (!SHA_PATTERN.test(workersCommit || '') || !SHA_PATTERN.test(checkedOutSha || '')) {
    authorityDecision = 'block';
    error = 'WORKER_BUILD_AUTHORITY_BLOCKED: Workers Builds must provide exact provider and checked-out commit SHAs.';
  } else if (workersCommit !== checkedOutSha) {
    authorityDecision = 'block';
    error = `WORKER_BUILD_AUTHORITY_BLOCKED: Workers Builds commit ${workersCommit} does not match checked-out source ${checkedOutSha}.`;
  } else if (!workersBranch || !workersBuildUuid) {
    authorityDecision = 'block';
    error = 'WORKER_BUILD_AUTHORITY_BLOCKED: Workers Builds branch and build UUID evidence are required.';
  } else if (command !== 'versions upload') {
    authorityDecision = 'block';
    error = `NATIVE_WORKER_GIT_PROMOTION_BLOCKED: Workers Builds may only run non-promoting "wrangler versions upload" for ${EXPECTED_WORKER}; observed ${command}.`;
  }
} else if (githubActions) {
  const canonicalManualWorkflow =
    githubEvent === 'workflow_dispatch' &&
    (githubWorkflow === 'Deploy' || githubWorkflow === 'FCR Worker Reconcile');

  if (canonicalManualWorkflow && command === 'deploy') {
    executionContext = 'github-manual-production';
    sourceSha = checkedOutSha;

    if (!SHA_PATTERN.test(checkedOutSha || '') || !SHA_PATTERN.test(githubEventSha || '')) {
      authorityDecision = 'block';
      error = 'WORKER_BUILD_AUTHORITY_BLOCKED: canonical GitHub production deploy requires exact checked-out and event SHAs.';
    } else if (checkedOutSha !== githubEventSha) {
      authorityDecision = 'block';
      error = `WORKER_BUILD_AUTHORITY_BLOCKED: checked-out production SHA ${checkedOutSha} does not match GitHub workflow SHA ${githubEventSha}.`;
    } else {
      productionPromotionAuthorized = true;
    }
  } else {
    executionContext = 'github-verification-only';
  }
} else if (command === 'dev' || command === 'types') {
  executionContext = 'local-verification';
}

const receipt = {
  kind: RECEIPT_KIND,
  ok: authorityDecision === 'allow',
  repository: REPOSITORY,
  configPath: CONFIG_PATH,
  workerName,
  wranglerCommand: command,
  executionContext,
  sourceSha: sourceSha || null,
  checkedOutSha,
  sourceBranch,
  buildUuid,
  githubEventSha,
  authorityDecision,
  productionPromotionAuthorized,
  nativeWorkerGitPromotionAllowed: false,
  canAuthorizeProviderMutation: false,
  observedAt: new Date().toISOString(),
  error,
};

await writeReceipt(receipt);

if (authorityDecision === 'block') {
  console.error(error);
  console.error(JSON.stringify(receipt));
  process.exit(1);
}

console.log('FCR Worker build authority membrane verified.');
console.log(JSON.stringify(receipt));
