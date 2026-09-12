import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import {
  executeFcrPublicWorkerSplit,
  rollbackFcrPublicWorkerSplit,
} from './fcr-access-public-worker-split.mjs';
import {
  FCR_CLOUDFLARE_ACCOUNT_ID,
  FCR_PUBLIC_ZONE,
} from './reconcile-cloudflare-access-public-zone.mjs';

export const SPLIT_RECEIPT_PATH = 'test-results/fcr-access-public-worker-split.json';
export const SPLIT_ROLLBACK_RECEIPT_PATH = 'test-results/fcr-access-public-worker-split-rollback.json';
export const SPLIT_ROLLBACK_ERROR_PATH = 'test-results/fcr-access-public-worker-split-rollback-error.json';
export const FRONT_DOOR_COMPAT_RECEIPT_PATH = 'test-results/fcr-access-front-door-recovery.json';
const FCR_ZONE = FCR_PUBLIC_ZONE;
const IDEMPOTENCY_PREFIX = 'fcr-access-split-v1:';

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function exactHead(env) {
  const sha = clean(env.EXPECTED_HEAD_SHA);
  if (!/^[0-9a-f]{40}$/.test(sha)) {
    const error = new Error('EXPECTED_HEAD_SHA must be an exact lowercase 40-character SHA.');
    error.classification = 'split-execution-exact-head-required';
    throw error;
  }
  return sha;
}

function mutationIdempotencyKey(command, expectedHeadSha) {
  const digest = createHash('sha256')
    .update([
      'fcr-access-public-worker-split/v1',
      command,
      FCR_ZONE,
      expectedHeadSha,
    ].join('\n'))
    .digest('hex');
  return `${IDEMPOTENCY_PREFIX}${digest}`;
}

function workflowMetadata(env, expectedHeadSha, command) {
  const workflowRunId = clean(env.GITHUB_RUN_ID) || null;
  const workflowRunAttempt = clean(env.GITHUB_RUN_ATTEMPT) || null;
  return {
    observedAt: new Date().toISOString(),
    expectedHeadSha,
    workflowRunId,
    workflowRunAttempt,
    idempotencyKey: mutationIdempotencyKey(command, expectedHeadSha),
  };
}

function boundedError(error, metadata) {
  const mutationOutcome = ['none', 'performed', 'unknown'].includes(error?.mutationOutcome)
    ? error.mutationOutcome
    : 'unknown';
  return {
    schemaVersion: 1,
    scope: 'fcr-access-public-worker-split',
    ...metadata,
    zone: FCR_ZONE,
    state: mutationOutcome === 'unknown' ? 'reconcile-required' : 'failed',
    mutationOutcome,
    mutationPerformed: mutationOutcome === 'performed',
    rollbackPerformed: error?.rollbackPerformed === true,
    currentTruthState: 'unknown',
    classification: clean(error?.classification) || 'split-execution-failed',
    sourceApplicationId: clean(error?.sourceApplicationId) || null,
    managedApplicationId: clean(error?.managedApplicationId) || null,
  };
}

function compatibilityBase(metadata) {
  return {
    schemaVersion: 2,
    scope: 'fcr-access-front-door-recovery',
    observedAt: metadata.observedAt,
    workflowRunId: metadata.workflowRunId,
    workflowRunAttempt: metadata.workflowRunAttempt,
    expectedHeadSha: metadata.expectedHeadSha,
    applyRequested: true,
    accountId: FCR_CLOUDFLARE_ACCOUNT_ID,
    zone: FCR_ZONE,
    credentialSource: 'CLOUDFLARE_ACCESS_ADMIN_API_TOKEN',
    credentialFailures: [],
    denyUnmatchedRequests: null,
    matchingApplicationCount: null,
  };
}

export function projectSplitCompatibilityReceipt(receipt, metadata, { rollback = false } = {}) {
  if (receipt?.scope !== 'fcr-access-public-worker-split') {
    throw new Error('Split compatibility projection requires an FCR split receipt.');
  }

  const failed = receipt.state === 'failed' || receipt.state === 'reconcile-required';
  if (failed) {
    const boundedClassification = receipt.classification === 'dedicated-admin-credential-required'
      ? 'dedicated-admin-credential-required'
      : receipt.classification === 'provider-credential-invalid'
        ? 'provider-credential-invalid'
        : rollback
          ? 'provider-recovery-failed'
          : 'provider-apply-failed';
    return {
      ...compatibilityBase(metadata),
      state: 'blocked',
      mutationPerformed: receipt.mutationOutcome === 'performed' || receipt.mutationOutcome === 'unknown',
      rollbackPerformed: receipt.rollbackPerformed === true,
      alreadyExempt: null,
      action: 'none',
      classification: boundedClassification,
    };
  }

  if (rollback) {
    if (receipt.rollbackPerformed !== true || receipt.splitApplied !== false) {
      throw new Error('Rollback compatibility projection requires a completed split rollback receipt.');
    }
    return {
      ...compatibilityBase(metadata),
      state: 'attention',
      mutationPerformed: true,
      rollbackPerformed: true,
      alreadyExempt: false,
      action: 'rolled-back-public-bypass',
      classification: null,
    };
  }

  if (receipt.mutationOutcome !== 'performed'
    || receipt.mutationPerformed !== true
    || receipt.splitApplied !== true) {
    throw new Error('Apply compatibility projection requires a performed split receipt.');
  }
  return {
    ...compatibilityBase(metadata),
    state: 'mutated-needs-browser-proof',
    mutationPerformed: true,
    rollbackPerformed: false,
    alreadyExempt: true,
    action: 'created-public-bypass',
    classification: null,
  };
}

async function writeJson(path, payload) {
  await mkdir('test-results', { recursive: true });
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

export async function runFcrAccessSplitCli({
  command,
  env = process.env,
  receiptPath = SPLIT_RECEIPT_PATH,
  rollbackReceiptPath = SPLIT_ROLLBACK_RECEIPT_PATH,
  rollbackErrorPath = SPLIT_ROLLBACK_ERROR_PATH,
  compatibilityReceiptPath = FRONT_DOOR_COMPAT_RECEIPT_PATH,
  execute = executeFcrPublicWorkerSplit,
  rollback = rollbackFcrPublicWorkerSplit,
} = {}) {
  const expectedHeadSha = exactHead(env);

  if (command === 'apply') {
    const metadata = workflowMetadata(env, expectedHeadSha, 'apply');
    try {
      const receipt = await execute({ env });
      const durable = {
        ...receipt,
        ...metadata,
        currentTruthState: 'unknown',
      };
      await writeJson(receiptPath, durable);
      await writeJson(
        compatibilityReceiptPath,
        projectSplitCompatibilityReceipt(durable, metadata),
      );
      return durable;
    } catch (error) {
      const failure = boundedError(error, metadata);
      await writeJson(receiptPath, failure);
      await writeJson(
        compatibilityReceiptPath,
        projectSplitCompatibilityReceipt(failure, metadata),
      );
      throw error;
    }
  }

  if (command === 'rollback') {
    const metadata = workflowMetadata(env, expectedHeadSha, 'rollback');
    const original = JSON.parse(await readFile(receiptPath, 'utf8'));
    const expectedApplyIdempotencyKey = mutationIdempotencyKey('apply', expectedHeadSha);
    if (original?.scope !== 'fcr-access-public-worker-split'
      || original?.expectedHeadSha !== expectedHeadSha
      || original?.idempotencyKey !== expectedApplyIdempotencyKey
      || original?.mutationOutcome !== 'performed'
      || original?.splitApplied !== true) {
      const error = new Error('Rollback requires the exact performed split receipt for the current approved head and mutation identity.');
      error.classification = 'split-rollback-receipt-head-mismatch';
      error.mutationOutcome = 'unknown';
      const failure = boundedError(error, metadata);
      await writeJson(rollbackErrorPath, failure);
      await writeJson(
        compatibilityReceiptPath,
        projectSplitCompatibilityReceipt(failure, metadata, { rollback: true }),
      );
      throw error;
    }

    try {
      const receipt = await rollback({ receipt: original, env });
      const durable = {
        ...receipt,
        ...metadata,
        appliedIdempotencyKey: original.idempotencyKey,
        currentTruthState: 'fresh',
      };
      await writeJson(rollbackReceiptPath, durable);
      await writeJson(
        compatibilityReceiptPath,
        projectSplitCompatibilityReceipt(durable, metadata, { rollback: true }),
      );
      return durable;
    } catch (error) {
      const failure = {
        ...boundedError(error, metadata),
        appliedIdempotencyKey: original.idempotencyKey,
      };
      await writeJson(rollbackErrorPath, failure);
      await writeJson(
        compatibilityReceiptPath,
        projectSplitCompatibilityReceipt(failure, metadata, { rollback: true }),
      );
      throw error;
    }
  }

  const error = new Error('Command must be exactly apply or rollback.');
  error.classification = 'split-execution-command-invalid';
  throw error;
}

const invokedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  runFcrAccessSplitCli({ command: process.argv[2] })
    .catch(() => {
      process.exitCode = 1;
    });
}