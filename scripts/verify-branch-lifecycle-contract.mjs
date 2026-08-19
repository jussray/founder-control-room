import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const contract = JSON.parse(
  await readFile(new URL('../.control-room/founder-control.contract.json', import.meta.url), 'utf8'),
);

const lifecycle = contract.branchLifecycle;
assert.ok(lifecycle, 'branchLifecycle contract is required');

assert.deepEqual(lifecycle.classifications, ['stale', 'superseded', 'retirable']);
assert.equal(lifecycle.rules.staleDoesNotImplySuperseded, true);
assert.equal(lifecycle.rules.staleDoesNotImplyRetirable, true);
assert.equal(lifecycle.rules.retirementRequiresUniqueWorkInventory, true);
assert.equal(lifecycle.rules.retirementRequiresDispositionForEveryUniqueSlice, true);
assert.equal(lifecycle.rules.retirementRequiresZeroUnclassifiedResidual, true);
assert.equal(lifecycle.rules.unknownResidualBlocksRetirement, true);

const allowedDispositions = new Set([
  'integrated',
  'superseded',
  'carried-forward',
  'intentionally-discarded',
]);
assert.deepEqual(new Set(lifecycle.allowedDispositions), allowedDispositions);

const requiredReceiptFields = [
  'repository',
  'branch',
  'headSha',
  'mergeBaseSha',
  'currentMainSha',
  'uniqueSlices',
  'unresolvedReviewFindings',
  'residualUniqueWork',
  'safeToClose',
  'safeToDeleteBranch',
];
assert.deepEqual(lifecycle.requiredRetirementReceiptFields, requiredReceiptFields);

function validateRetirementReceipt(receipt) {
  const errors = [];

  for (const field of requiredReceiptFields) {
    if (!(field in receipt)) errors.push(`missing:${field}`);
  }

  for (const field of ['repository', 'branch', 'headSha', 'mergeBaseSha', 'currentMainSha']) {
    if (typeof receipt[field] !== 'string' || receipt[field].trim() === '') {
      errors.push(`invalid:${field}`);
    }
  }

  if (!Array.isArray(receipt.uniqueSlices)) {
    errors.push('invalid:uniqueSlices');
  } else {
    for (const [index, slice] of receipt.uniqueSlices.entries()) {
      if (!slice || typeof slice.id !== 'string' || slice.id.trim() === '') {
        errors.push(`invalid:uniqueSlices[${index}].id`);
        continue;
      }
      if (!allowedDispositions.has(slice.disposition)) {
        errors.push(`unclassified:${slice.id}`);
        continue;
      }
      if (slice.disposition === 'carried-forward' &&
          (typeof slice.destination !== 'string' || slice.destination.trim() === '')) {
        errors.push(`missing-destination:${slice.id}`);
      }
      if (slice.disposition === 'intentionally-discarded' &&
          (typeof slice.reason !== 'string' || slice.reason.trim() === '')) {
        errors.push(`missing-reason:${slice.id}`);
      }
      if ((slice.disposition === 'integrated' || slice.disposition === 'superseded') &&
          (typeof slice.evidence !== 'string' || slice.evidence.trim() === '')) {
        errors.push(`missing-evidence:${slice.id}`);
      }
    }
  }

  if (!Array.isArray(receipt.unresolvedReviewFindings)) {
    errors.push('invalid:unresolvedReviewFindings');
  }

  if (!Array.isArray(receipt.residualUniqueWork)) {
    errors.push('invalid:residualUniqueWork');
  } else if (receipt.residualUniqueWork.length !== 0) {
    errors.push('residual-unique-work');
  }

  const retirable = errors.length === 0;
  if (receipt.safeToClose !== retirable) errors.push('safeToClose-mismatch');
  if (receipt.safeToDeleteBranch !== retirable) errors.push('safeToDeleteBranch-mismatch');

  return { retirable: errors.length === 0, errors };
}

const baseReceipt = {
  repository: 'jussray/example',
  branch: 'fix/example',
  headSha: 'a'.repeat(40),
  mergeBaseSha: 'b'.repeat(40),
  currentMainSha: 'c'.repeat(40),
  uniqueSlices: [],
  unresolvedReviewFindings: [],
  residualUniqueWork: [],
  safeToClose: true,
  safeToDeleteBranch: true,
};

assert.equal(validateRetirementReceipt(baseReceipt).retirable, true);

const staleOnly = {
  ...baseReceipt,
  uniqueSlices: [{ id: 'security-fix', disposition: 'unknown' }],
  residualUniqueWork: ['security-fix'],
  safeToClose: false,
  safeToDeleteBranch: false,
};
assert.equal(validateRetirementReceipt(staleOnly).retirable, false, 'stale alone must never imply retirable');

const carriedForwardWithoutDestination = {
  ...baseReceipt,
  uniqueSlices: [{ id: 'test', disposition: 'carried-forward' }],
  safeToClose: false,
  safeToDeleteBranch: false,
};
assert.equal(validateRetirementReceipt(carriedForwardWithoutDestination).retirable, false);

const discardedWithoutReason = {
  ...baseReceipt,
  uniqueSlices: [{ id: 'old-design', disposition: 'intentionally-discarded' }],
  safeToClose: false,
  safeToDeleteBranch: false,
};
assert.equal(validateRetirementReceipt(discardedWithoutReason).retirable, false);

const fullyAccounted = {
  ...baseReceipt,
  uniqueSlices: [
    { id: 'security-fix', disposition: 'integrated', evidence: 'main@abc123' },
    { id: 'old-test', disposition: 'superseded', evidence: 'PR #42 stronger test' },
    { id: 'migration', disposition: 'carried-forward', destination: 'PR #43' },
    { id: 'obsolete-doc', disposition: 'intentionally-discarded', reason: 'contradicted by current architecture' },
  ],
};
assert.equal(validateRetirementReceipt(fullyAccounted).retirable, true);

console.log('Branch lifecycle contract verified: stale != superseded != retirable; residual unique work must be zero.');
