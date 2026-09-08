import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import {
  executeFcrPublicWorkerSplit,
  rollbackFcrPublicWorkerSplit,
} from './fcr-access-public-worker-split.mjs';

export const SPLIT_RECEIPT_PATH = 'test-results/fcr-access-public-worker-split.json';
export const SPLIT_ROLLBACK_ERROR_PATH = 'test-results/fcr-access-public-worker-split-rollback-error.json';

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

function workflowMetadata(env, expectedHeadSha) {
  const workflowRunId = clean(env.GITHUB_RUN_ID) || null;
  const workflowRunAttempt = clean(env.GITHUB_RUN_ATTEMPT) || null;
  return {
    observedAt: new Date().toISOString(),
    expectedHeadSha,
    workflowRunId,
    workflowRunAttempt,
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
    state: mutationOutcome === 'unknown' ? 'reconcile-required' : 'failed',
    mutationOutcome,
    mutationPerformed: mutationOutcome === 'performed',
    rollbackPerformed: error?.rollbackPerformed === true,
    classification: clean(error?.classification) || 'split-execution-failed',
    sourceApplicationId: clean(error?.sourceApplicationId) || null,
    managedApplicationId: clean(error?.managedApplicationId) || null,
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
  rollbackErrorPath = SPLIT_ROLLBACK_ERROR_PATH,
  execute = executeFcrPublicWorkerSplit,
  rollback = rollbackFcrPublicWorkerSplit,
} = {}) {
  const expectedHeadSha = exactHead(env);
  const metadata = workflowMetadata(env, expectedHeadSha);

  if (command === 'apply') {
    try {
      const receipt = await execute({ env });
      const durable = { ...receipt, ...metadata };
      await writeJson(receiptPath, durable);
      return durable;
    } catch (error) {
      const failure = boundedError(error, metadata);
      await writeJson(receiptPath, failure);
      throw error;
    }
  }

  if (command === 'rollback') {
    const original = JSON.parse(await readFile(receiptPath, 'utf8'));
    if (original?.scope !== 'fcr-access-public-worker-split'
      || original?.expectedHeadSha !== expectedHeadSha
      || original?.mutationOutcome !== 'performed'
      || original?.splitApplied !== true) {
      const error = new Error('Rollback requires the exact performed split receipt for the current approved head.');
      error.classification = 'split-rollback-receipt-head-mismatch';
      throw error;
    }

    try {
      const receipt = await rollback({ receipt: original, env });
      const durable = { ...receipt, ...workflowMetadata(env, expectedHeadSha) };
      await writeJson(receiptPath, durable);
      return durable;
    } catch (error) {
      const failure = boundedError(error, workflowMetadata(env, expectedHeadSha));
      await writeJson(rollbackErrorPath, failure);
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
