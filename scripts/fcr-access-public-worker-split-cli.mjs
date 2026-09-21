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
const IDEMPOTENCY_PREFIX = 'fcr-access-split-v2:';

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
      'fcr-access-public-worker-split/v2',
      command,
      FCR_ZONE,
      expectedHeadSha,
    ].join('\n'))
    .digest('hex');
  return `${IDEMPOTENCY_PREFIX}${digest}`;
}

function workflowMetadata(env, expectedHeadSha, command) {
  return {
    observedAt: new Date().toISOString(),
    expectedHeadSha,
    workflowRunId: clean(env.GITHUB_RUN_ID) || null,
    workflowRunAttempt: clean(env.GITHUB_RUN_ATTEMPT) || null,
    idempotencyKey: mutationIdempotencyKey(command, expectedHeadSha),
  };
}

async function writeJson(path, payload) {
  await mkdir('test-results', { recursive: true });
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

function boundedError(error, metadata, prior = {}) {
  const mutationOutcome = ['none', 'performed', 'unknown'].includes(error?.mutationOutcome)
    ? error.mutationOutcome
    : (['none', 'performed', 'unknown'].includes(prior?.mutationOutcome) ? prior.mutationOutcome : 'unknown');
  return {
    ...prior,
    schemaVersion: 2,
    scope: 'fcr-access-public-worker-split',
    ...metadata,
    zone: FCR_ZONE,
    state: mutationOutcome === 'none' ? 'failed' : 'reconcile-required',
    mutationOutcome,
    mutationPerformed: mutationOutcome === 'performed' || prior?.mutationPerformed === true,
    rollbackPerformed: prior?.rollbackPerformed === true || error?.rollbackPerformed === true,
    currentTruthState: 'unknown',
    classification: clean(error?.classification) || clean(prior?.classification) || 'split-execution-failed',
    sourceApplicationId: clean(error?.sourceApplicationId) || clean(prior?.sourceApplicationId) || null,
    managedApplicationId: clean(error?.managedApplicationId) || clean(prior?.managedApplicationId) || null,
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

  const terminalFailure = receipt.state === 'failed' || receipt.state === 'reconcile-required';
  if (terminalFailure) {
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
      mutationPerformed: receipt.mutationPerformed === true || receipt.mutationOutcome === 'performed',
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

function attachApplyMetadata(receipt, metadata) {
  return {
    ...receipt,
    ...metadata,
    currentTruthState: 'unknown',
  };
}

function attachRollbackMetadata(receipt, metadata, original) {
  return {
    ...receipt,
    observedAt: metadata.observedAt,
    expectedHeadSha: original.expectedHeadSha,
    workflowRunId: metadata.workflowRunId,
    workflowRunAttempt: metadata.workflowRunAttempt,
    idempotencyKey: original.idempotencyKey,
    rollbackIdempotencyKey: metadata.idempotencyKey,
    currentTruthState: receipt.rollbackPerformed === true ? 'fresh' : 'unknown',
  };
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
    let latest = null;
    const persistReceipt = async (checkpoint) => {
      latest = attachApplyMetadata(checkpoint, metadata);
      await writeJson(receiptPath, latest);
    };

    try {
      const receipt = await execute({ env, persistReceipt });
      const durable = attachApplyMetadata(receipt, metadata);
      latest = durable;
      await writeJson(receiptPath, durable);
      await writeJson(
        compatibilityReceiptPath,
        projectSplitCompatibilityReceipt(durable, metadata),
      );
      return durable;
    } catch (error) {
      if (!latest) {
        try {
          latest = await readJson(receiptPath);
        } catch {
          latest = null;
        }
      }
      const failure = boundedError(error, metadata, latest ?? {});
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
    const original = await readJson(receiptPath);
    const expectedApplyIdempotencyKey = mutationIdempotencyKey('apply', expectedHeadSha);
    if (original?.scope !== 'fcr-access-public-worker-split'
      || original?.expectedHeadSha !== expectedHeadSha
      || original?.idempotencyKey !== expectedApplyIdempotencyKey
      || !['performed', 'unknown'].includes(original?.mutationOutcome)) {
      const error = new Error('Rollback requires the exact durable split receipt for the current approved head and mutation identity.');
      error.classification = 'split-rollback-receipt-head-mismatch';
      error.mutationOutcome = 'unknown';
      const failure = boundedError(error, metadata, original ?? {});
      await writeJson(rollbackErrorPath, failure);
      await writeJson(
        compatibilityReceiptPath,
        projectSplitCompatibilityReceipt(failure, metadata, { rollback: true }),
      );
      throw error;
    }

    let latest = original;
    const persistReceipt = async (checkpoint) => {
      latest = attachRollbackMetadata(checkpoint, metadata, original);
      await writeJson(receiptPath, latest);
    };

    try {
      const receipt = await rollback({ receipt: original, env, persistReceipt });
      const durable = attachRollbackMetadata(receipt, metadata, original);
      latest = durable;
      await writeJson(receiptPath, durable);
      await writeJson(rollbackReceiptPath, durable);
      await writeJson(
        compatibilityReceiptPath,
        projectSplitCompatibilityReceipt(durable, metadata, { rollback: true }),
      );
      return durable;
    } catch (error) {
      const failure = {
        ...boundedError(error, metadata, latest ?? original),
        expectedHeadSha: original.expectedHeadSha,
        idempotencyKey: original.idempotencyKey,
        rollbackIdempotencyKey: metadata.idempotencyKey,
      };
      await writeJson(receiptPath, failure);
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
