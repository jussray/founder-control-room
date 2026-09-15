import fs from 'node:fs';
import path from 'node:path';

export const SCHEMA = 'juss/pr-continuity@v1';

const clean = (value) => typeof value === 'string' ? value.trim() : '';

export function validateRolloverReceipt(receipt, expectedRootSha = '') {
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) {
    throw new Error('ROLLOVER_RECEIPT_INVALID');
  }
  if (receipt.schema !== SCHEMA || receipt.mode !== 'rollover') {
    throw new Error('ROLLOVER_RECEIPT_SCHEMA_MISMATCH');
  }

  const expected = clean(expectedRootSha).toLowerCase();
  const observed = clean(receipt.rootBaseSha).toLowerCase();
  if (expected && observed !== expected) {
    throw new Error(`ROLLOVER_ROOT_SHA_MISMATCH: expected ${expected}, observed ${observed || '<missing>'}`);
  }

  if (!Array.isArray(receipt.results) || !Array.isArray(receipt.failureReceipts)) {
    throw new Error('ROLLOVER_RECEIPT_ARRAYS_REQUIRED');
  }

  const blocked = receipt.results.filter((item) => String(item?.state || '').startsWith('BLOCKED'));
  const blockedCount = Number(receipt.blockedCount);
  const failureReceiptCount = Number(receipt.failureReceiptCount);
  if (!Number.isInteger(blockedCount) || blockedCount !== blocked.length) {
    throw new Error(`ROLLOVER_BLOCKED_COUNT_MISMATCH: expected ${blocked.length}, observed ${receipt.blockedCount}`);
  }
  if (!Number.isInteger(failureReceiptCount) || failureReceiptCount !== receipt.failureReceipts.length) {
    throw new Error(`ROLLOVER_FAILURE_COUNT_MISMATCH: expected ${receipt.failureReceipts.length}, observed ${receipt.failureReceiptCount}`);
  }

  const seenReceiptIds = new Set();
  for (const failure of receipt.failureReceipts) {
    const id = clean(failure?.receiptId);
    if (!id) throw new Error('ROLLOVER_FAILURE_RECEIPT_ID_REQUIRED');
    if (seenReceiptIds.has(id)) throw new Error(`ROLLOVER_DUPLICATE_FAILURE_RECEIPT: ${id}`);
    seenReceiptIds.add(id);
  }

  for (const item of blocked) {
    const hasReceipt = receipt.failureReceipts.some((failure) => Number(failure?.pullRequest) === Number(item?.number));
    if (!hasReceipt) {
      throw new Error(`ROLLOVER_BLOCKER_WITHOUT_RECEIPT: #${item?.number ?? '<unknown>'}`);
    }
  }

  if (receipt.mergeApproved !== false || receipt.authorizesMerge !== false || receipt.authorizesDeploy !== false) {
    throw new Error('ROLLOVER_MUST_NOT_AUTHORIZE_MUTATION');
  }

  return {
    graphReady: blockedCount === 0,
    disposition: blockedCount === 0 ? 'COMPLETED_CLEAR' : 'COMPLETED_WITH_BLOCKERS',
    blockedCount,
    failureReceiptCount,
  };
}

export function evaluateRolloverAttempt({attemptOutcome, receipt, expectedRootSha = ''}) {
  const summary = validateRolloverReceipt(receipt, expectedRootSha);
  const outcome = clean(attemptOutcome);

  if (outcome === 'failure' && summary.blockedCount === 0) {
    throw new Error('ROLLOVER_FAILED_WITHOUT_BLOCKED_RECEIPT');
  }
  if (outcome && outcome !== 'success' && outcome !== 'failure') {
    throw new Error(`ROLLOVER_ATTEMPT_OUTCOME_UNKNOWN: ${outcome}`);
  }

  return {
    ...summary,
    attemptOutcome: outcome || 'unknown',
    controlPlaneHealthy: true,
  };
}

export function loadReceipt(receiptPath) {
  const resolved = path.resolve(receiptPath);
  if (!fs.existsSync(resolved)) throw new Error(`ROLLOVER_RECEIPT_MISSING: ${resolved}`);
  return JSON.parse(fs.readFileSync(resolved, 'utf8'));
}

function main() {
  const receiptPath = process.env.PR_CONTINUITY_RECEIPT_PATH || 'artifacts/pr-continuity.json';
  const receipt = loadReceipt(receiptPath);
  const result = evaluateRolloverAttempt({
    attemptOutcome: process.env.ROLLOVER_ATTEMPT_OUTCOME || '',
    receipt,
    expectedRootSha: process.env.EXPECTED_ROOT_SHA || '',
  });

  for (const failure of receipt.failureReceipts || []) {
    const pr = failure?.pullRequest ? `#${failure.pullRequest}` : '#?';
    const code = clean(failure?.code) || clean(failure?.state) || 'BLOCKED';
    console.log(`::warning title=PR Continuity ${pr}::${code}`);
  }
  console.log(JSON.stringify(result));
}

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exit(1);
  }
}
