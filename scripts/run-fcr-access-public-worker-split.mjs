import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import {
  executeFcrPublicWorkerSplit,
  rollbackFcrPublicWorkerSplit,
} from './fcr-access-public-worker-split.mjs';
import {
  FCR_CLOUDFLARE_ACCOUNT_ID,
  FCR_PUBLIC_ZONE,
} from './reconcile-cloudflare-access-public-zone.mjs';

const SPLIT_RECEIPT_PATH = 'test-results/fcr-access-public-worker-split.json';
const PUBLIC_RECEIPT_PATH = 'test-results/fcr-access-front-door-recovery.json';

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function observedAt() {
  return new Date().toISOString();
}

function runIdentity(env = process.env) {
  const expectedHeadSha = clean(env.EXPECTED_HEAD_SHA);
  if (!/^[0-9a-f]{40}$/.test(expectedHeadSha)) {
    throw new Error('EXPECTED_HEAD_SHA must be one lowercase 40-character SHA.');
  }
  const workflowRunId = /^\d+$/.test(clean(env.GITHUB_RUN_ID)) ? clean(env.GITHUB_RUN_ID) : null;
  const workflowRunAttempt = /^\d+$/.test(clean(env.GITHUB_RUN_ATTEMPT)) ? clean(env.GITHUB_RUN_ATTEMPT) : null;
  return { expectedHeadSha, workflowRunId, workflowRunAttempt };
}

function writeJson(path, value) {
  mkdirSync('test-results', { recursive: true });
  writeFileSync(path, `${JSON.stringify(value)}\n`, 'utf8');
}

function basePublicReceipt(env = process.env) {
  const identity = runIdentity(env);
  return {
    schemaVersion: 2,
    scope: 'fcr-access-front-door-recovery',
    observedAt: observedAt(),
    workflowRunId: identity.workflowRunId,
    workflowRunAttempt: identity.workflowRunAttempt,
    expectedHeadSha: identity.expectedHeadSha,
    accountId: FCR_CLOUDFLARE_ACCOUNT_ID,
    zone: FCR_PUBLIC_ZONE,
    credentialSource: 'CLOUDFLARE_ACCESS_ADMIN_API_TOKEN',
    credentialFailures: [],
    denyUnmatchedRequests: null,
    matchingApplicationCount: 1,
  };
}

export function projectAppliedSplitReceipt(splitReceipt, env = process.env) {
  if (splitReceipt?.scope !== 'fcr-access-public-worker-split'
    || splitReceipt?.splitApplied !== true
    || splitReceipt?.mutationOutcome !== 'performed'
    || splitReceipt?.mutationPerformed !== true) {
    throw new Error('A performed split receipt is required for the public projection.');
  }
  return {
    ...basePublicReceipt(env),
    state: 'mutated-needs-browser-proof',
    applyRequested: true,
    mutationPerformed: true,
    rollbackPerformed: false,
    alreadyExempt: true,
    action: 'created-public-bypass',
    classification: null,
  };
}

export function projectRolledBackSplitReceipt(splitReceipt, env = process.env) {
  if (splitReceipt?.scope !== 'fcr-access-public-worker-split'
    || splitReceipt?.rollbackPerformed !== true
    || splitReceipt?.splitApplied !== false) {
    throw new Error('A completed split rollback receipt is required for the public projection.');
  }
  return {
    ...basePublicReceipt(env),
    state: 'attention',
    applyRequested: true,
    mutationPerformed: true,
    rollbackPerformed: true,
    alreadyExempt: false,
    action: 'rolled-back-public-bypass',
    classification: null,
  };
}

export function projectBlockedSplitReceipt(error, env = process.env, { rollback = false } = {}) {
  const mutationOutcome = clean(error?.mutationOutcome);
  const possiblyMutated = mutationOutcome === 'performed' || mutationOutcome === 'unknown';
  const classification = error?.classification === 'dedicated-admin-credential-required'
    ? 'dedicated-admin-credential-required'
    : error?.classification === 'provider-credential-invalid'
      ? 'provider-credential-invalid'
      : rollback
        ? 'provider-recovery-failed'
        : 'provider-apply-failed';
  return {
    ...basePublicReceipt(env),
    state: 'blocked',
    applyRequested: true,
    mutationPerformed: possiblyMutated,
    rollbackPerformed: error?.rollbackPerformed === true,
    alreadyExempt: null,
    action: 'none',
    classification,
  };
}

async function apply(env = process.env) {
  try {
    const splitReceipt = await executeFcrPublicWorkerSplit({ env });
    const exactReceipt = {
      ...splitReceipt,
      observedAt: observedAt(),
      ...runIdentity(env),
    };
    writeJson(SPLIT_RECEIPT_PATH, exactReceipt);
    writeJson(PUBLIC_RECEIPT_PATH, projectAppliedSplitReceipt(exactReceipt, env));
  } catch (error) {
    writeJson(PUBLIC_RECEIPT_PATH, projectBlockedSplitReceipt(error, env));
    throw error;
  }
}

async function rollback(env = process.env) {
  let receipt;
  try {
    receipt = JSON.parse(readFileSync(SPLIT_RECEIPT_PATH, 'utf8'));
  } catch {
    const error = new Error('Exact performed split receipt is unavailable; rollback is fail-closed.');
    error.mutationOutcome = 'unknown';
    writeJson(PUBLIC_RECEIPT_PATH, projectBlockedSplitReceipt(error, env, { rollback: true }));
    throw error;
  }

  try {
    const rolledBack = await rollbackFcrPublicWorkerSplit({ receipt, env });
    const exactReceipt = {
      ...rolledBack,
      observedAt: observedAt(),
      ...runIdentity(env),
    };
    writeJson(SPLIT_RECEIPT_PATH, exactReceipt);
    writeJson(PUBLIC_RECEIPT_PATH, projectRolledBackSplitReceipt(exactReceipt, env));
  } catch (error) {
    writeJson(PUBLIC_RECEIPT_PATH, projectBlockedSplitReceipt(error, env, { rollback: true }));
    throw error;
  }
}

async function main() {
  const mode = process.argv[2];
  if (mode === '--apply') return apply();
  if (mode === '--rollback') return rollback();
  throw new Error('Usage: node scripts/run-fcr-access-public-worker-split.mjs --apply|--rollback');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(() => {
    process.exitCode = 1;
  });
}
