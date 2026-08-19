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
assert.equal(lifecycle.rules.retirementRequiresInventoryEvidence, true);
assert.equal(lifecycle.rules.inventoryCoverageMustBeComplete, true);
assert.equal(lifecycle.rules.inventoryCoverageMustBeSingleDisposition, true);
assert.equal(lifecycle.rules.retirementRequiresDispositionForEveryUniqueSlice, true);
assert.equal(lifecycle.rules.retirementRequiresZeroUnclassifiedResidual, true);
assert.equal(lifecycle.rules.unknownResidualBlocksRetirement, true);
assert.equal(lifecycle.rules.unresolvedReviewFindingsBlockRetirement, true);
assert.equal(lifecycle.rules.carriedForwardRequiresProviderVerifiedDestination, true);
assert.equal(lifecycle.rules.carriedForwardDestinationRequiresExactHead, true);
assert.equal(lifecycle.rules.directBranchDeletionExposed, false);
assert.equal(lifecycle.rules.branchDeletionRequiresReceiptAwareReconciler, true);
assert.equal(lifecycle.inventorySource, 'provider-compare');
assert.equal(lifecycle.destinationEvidenceSource, 'provider-readback');

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
  'inventoryEvidence',
  'uniqueSlices',
  'unresolvedReviewFindings',
  'residualUniqueWork',
  'safeToClose',
  'safeToDeleteBranch',
];
assert.deepEqual(lifecycle.requiredRetirementReceiptFields, requiredReceiptFields);

const fullSha = /^[0-9a-f]{40}$/i;
const liveDestinationStates = new Set(['open', 'merged', 'main']);

function validNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function validateDestinationEvidence(slice, errors) {
  const destination = slice.destinationEvidence;
  if (!destination || typeof destination !== 'object' || Array.isArray(destination)) {
    errors.push(`invalid-destination:${slice.id}`);
    return;
  }
  if (destination.source !== lifecycle.destinationEvidenceSource) {
    errors.push(`invalid-destination-source:${slice.id}`);
  }
  if (!validNonEmptyString(destination.repository)) {
    errors.push(`invalid-destination-repository:${slice.id}`);
  }
  if (!validNonEmptyString(destination.ref)) {
    errors.push(`invalid-destination-ref:${slice.id}`);
  }
  if (typeof destination.headSha !== 'string' || !fullSha.test(destination.headSha)) {
    errors.push(`invalid-destination-head:${slice.id}`);
  }
  if (!liveDestinationStates.has(destination.state)) {
    errors.push(`invalid-destination-state:${slice.id}`);
  }
}

function validateRetirementReceipt(receipt) {
  const errors = [];

  for (const field of requiredReceiptFields) {
    if (!(field in receipt)) errors.push(`missing:${field}`);
  }

  for (const field of ['repository', 'branch']) {
    if (!validNonEmptyString(receipt[field])) errors.push(`invalid:${field}`);
  }

  for (const field of ['headSha', 'mergeBaseSha', 'currentMainSha']) {
    if (typeof receipt[field] !== 'string' || !fullSha.test(receipt[field])) {
      errors.push(`invalid:${field}`);
    }
  }

  const requiredInventoryTokens = new Set();
  const inventory = receipt.inventoryEvidence;
  if (!inventory || typeof inventory !== 'object' || Array.isArray(inventory)) {
    errors.push('invalid:inventoryEvidence');
  } else {
    if (inventory.source !== lifecycle.inventorySource) errors.push('invalid:inventoryEvidence.source');
    for (const field of ['headSha', 'mergeBaseSha', 'currentMainSha']) {
      if (inventory[field] !== receipt[field]) errors.push(`inventory-mismatch:${field}`);
    }

    if (!Array.isArray(inventory.uniqueCommitShas)) {
      errors.push('invalid:inventoryEvidence.uniqueCommitShas');
    } else {
      const seen = new Set();
      for (const sha of inventory.uniqueCommitShas) {
        if (typeof sha !== 'string' || !fullSha.test(sha)) {
          errors.push(`invalid:inventory-commit:${String(sha)}`);
          continue;
        }
        if (seen.has(sha)) errors.push(`duplicate:inventory-commit:${sha}`);
        seen.add(sha);
        requiredInventoryTokens.add(`commit:${sha}`);
      }
    }

    if (!Array.isArray(inventory.uniqueFiles)) {
      errors.push('invalid:inventoryEvidence.uniqueFiles');
    } else {
      const seen = new Set();
      for (const file of inventory.uniqueFiles) {
        if (!validNonEmptyString(file)) {
          errors.push(`invalid:inventory-file:${String(file)}`);
          continue;
        }
        if (seen.has(file)) errors.push(`duplicate:inventory-file:${file}`);
        seen.add(file);
        requiredInventoryTokens.add(`file:${file}`);
      }
    }
  }

  const coveredInventoryTokens = new Set();
  const sliceIds = new Set();
  if (!Array.isArray(receipt.uniqueSlices)) {
    errors.push('invalid:uniqueSlices');
  } else {
    for (const [index, slice] of receipt.uniqueSlices.entries()) {
      if (!slice || !validNonEmptyString(slice.id)) {
        errors.push(`invalid:uniqueSlices[${index}].id`);
        continue;
      }
      if (sliceIds.has(slice.id)) errors.push(`duplicate-slice:${slice.id}`);
      sliceIds.add(slice.id);

      if (!allowedDispositions.has(slice.disposition)) {
        errors.push(`unclassified:${slice.id}`);
      }
      if (!Array.isArray(slice.covers) || slice.covers.length === 0) {
        errors.push(`missing-coverage:${slice.id}`);
      } else {
        for (const token of slice.covers) {
          if (typeof token !== 'string' || !requiredInventoryTokens.has(token)) {
            errors.push(`unexpected-coverage:${slice.id}:${String(token)}`);
            continue;
          }
          if (coveredInventoryTokens.has(token)) errors.push(`duplicate-coverage:${token}`);
          coveredInventoryTokens.add(token);
        }
      }

      if (slice.disposition === 'carried-forward') {
        validateDestinationEvidence(slice, errors);
      }
      if (slice.disposition === 'intentionally-discarded' && !validNonEmptyString(slice.reason)) {
        errors.push(`missing-reason:${slice.id}`);
      }
      if ((slice.disposition === 'integrated' || slice.disposition === 'superseded') &&
          !validNonEmptyString(slice.evidence)) {
        errors.push(`missing-evidence:${slice.id}`);
      }
    }
  }

  for (const token of requiredInventoryTokens) {
    if (!coveredInventoryTokens.has(token)) errors.push(`unclassified-inventory:${token}`);
  }

  if (!Array.isArray(receipt.unresolvedReviewFindings)) {
    errors.push('invalid:unresolvedReviewFindings');
  } else if (receipt.unresolvedReviewFindings.length !== 0) {
    errors.push('unresolved-review-findings');
  }

  if (!Array.isArray(receipt.residualUniqueWork)) {
    errors.push('invalid:residualUniqueWork');
  } else if (receipt.residualUniqueWork.length !== 0) {
    errors.push('residual-unique-work');
  }

  if (typeof receipt.safeToClose !== 'boolean') errors.push('invalid:safeToClose');
  if (typeof receipt.safeToDeleteBranch !== 'boolean') errors.push('invalid:safeToDeleteBranch');

  const semanticallyRetirable = errors.length === 0;
  if (receipt.safeToClose !== semanticallyRetirable) errors.push('safeToClose-mismatch');
  if (receipt.safeToDeleteBranch !== semanticallyRetirable) errors.push('safeToDeleteBranch-mismatch');

  return { retirable: errors.length === 0, errors };
}

const baseReceipt = {
  repository: 'jussray/example',
  branch: 'fix/example',
  headSha: 'a'.repeat(40),
  mergeBaseSha: 'b'.repeat(40),
  currentMainSha: 'c'.repeat(40),
  inventoryEvidence: {
    source: 'provider-compare',
    headSha: 'a'.repeat(40),
    mergeBaseSha: 'b'.repeat(40),
    currentMainSha: 'c'.repeat(40),
    uniqueCommitShas: [],
    uniqueFiles: [],
  },
  uniqueSlices: [],
  unresolvedReviewFindings: [],
  residualUniqueWork: [],
  safeToClose: true,
  safeToDeleteBranch: true,
};

assert.equal(validateRetirementReceipt(baseReceipt).retirable, true);

const unresolvedFinding = {
  ...baseReceipt,
  unresolvedReviewFindings: ['P1 security thread'],
  safeToClose: false,
  safeToDeleteBranch: false,
};
assert.equal(validateRetirementReceipt(unresolvedFinding).retirable, false, 'unresolved review findings must block retirement');

const incompleteInventory = {
  ...baseReceipt,
  inventoryEvidence: {
    ...baseReceipt.inventoryEvidence,
    uniqueFiles: ['src/security.ts'],
  },
  safeToClose: false,
  safeToDeleteBranch: false,
};
assert.equal(validateRetirementReceipt(incompleteInventory).retirable, false, 'inventory work cannot disappear by omitting uniqueSlices');

const staleOnly = {
  ...baseReceipt,
  inventoryEvidence: {
    ...baseReceipt.inventoryEvidence,
    uniqueFiles: ['src/security.ts'],
  },
  uniqueSlices: [{ id: 'security-fix', disposition: 'unknown', covers: ['file:src/security.ts'] }],
  residualUniqueWork: ['security-fix'],
  safeToClose: false,
  safeToDeleteBranch: false,
};
assert.equal(validateRetirementReceipt(staleOnly).retirable, false, 'stale alone must never imply retirable');

const carriedForwardLabelOnly = {
  ...baseReceipt,
  inventoryEvidence: {
    ...baseReceipt.inventoryEvidence,
    uniqueFiles: ['test/security.test.ts'],
  },
  uniqueSlices: [{
    id: 'test',
    disposition: 'carried-forward',
    destination: 'PR #43',
    covers: ['file:test/security.test.ts'],
  }],
  safeToClose: false,
  safeToDeleteBranch: false,
};
assert.equal(
  validateRetirementReceipt(carriedForwardLabelOnly).retirable,
  false,
  'a prose destination label is not provider-verified carry-forward evidence',
);

const carriedForwardStaleDestination = {
  ...baseReceipt,
  inventoryEvidence: {
    ...baseReceipt.inventoryEvidence,
    uniqueFiles: ['test/security.test.ts'],
  },
  uniqueSlices: [{
    id: 'test',
    disposition: 'carried-forward',
    destinationEvidence: {
      source: 'provider-readback',
      repository: 'jussray/example',
      ref: 'pull/43',
      headSha: 'f'.repeat(40),
      state: 'stale',
    },
    covers: ['file:test/security.test.ts'],
  }],
  safeToClose: false,
  safeToDeleteBranch: false,
};
assert.equal(
  validateRetirementReceipt(carriedForwardStaleDestination).retirable,
  false,
  'a destination already classified stale cannot satisfy current carry-forward evidence',
);

const discardedWithoutReason = {
  ...baseReceipt,
  inventoryEvidence: {
    ...baseReceipt.inventoryEvidence,
    uniqueFiles: ['docs/old.md'],
  },
  uniqueSlices: [{ id: 'old-design', disposition: 'intentionally-discarded', covers: ['file:docs/old.md'] }],
  safeToClose: false,
  safeToDeleteBranch: false,
};
assert.equal(validateRetirementReceipt(discardedWithoutReason).retirable, false);

const duplicateCoverage = {
  ...baseReceipt,
  inventoryEvidence: {
    ...baseReceipt.inventoryEvidence,
    uniqueFiles: ['src/security.ts'],
  },
  uniqueSlices: [
    { id: 'one', disposition: 'integrated', evidence: 'main@abc123', covers: ['file:src/security.ts'] },
    { id: 'two', disposition: 'superseded', evidence: 'PR #42', covers: ['file:src/security.ts'] },
  ],
  safeToClose: false,
  safeToDeleteBranch: false,
};
assert.equal(validateRetirementReceipt(duplicateCoverage).retirable, false, 'the same inventory token cannot receive conflicting dispositions');

const commitOne = 'd'.repeat(40);
const commitTwo = 'e'.repeat(40);
const fullyAccounted = {
  ...baseReceipt,
  inventoryEvidence: {
    ...baseReceipt.inventoryEvidence,
    uniqueCommitShas: [commitOne, commitTwo],
    uniqueFiles: ['src/security.ts', 'test/security.test.ts', 'supabase/migrations/001.sql', 'docs/old.md'],
  },
  uniqueSlices: [
    {
      id: 'security-fix',
      disposition: 'integrated',
      evidence: 'main@abc123',
      covers: [`commit:${commitOne}`, 'file:src/security.ts'],
    },
    {
      id: 'old-test',
      disposition: 'superseded',
      evidence: 'PR #42 stronger test',
      covers: [`commit:${commitTwo}`, 'file:test/security.test.ts'],
    },
    {
      id: 'migration',
      disposition: 'carried-forward',
      destinationEvidence: {
        source: 'provider-readback',
        repository: 'jussray/example',
        ref: 'pull/43',
        headSha: 'f'.repeat(40),
        state: 'open',
      },
      covers: ['file:supabase/migrations/001.sql'],
    },
    {
      id: 'obsolete-doc',
      disposition: 'intentionally-discarded',
      reason: 'contradicted by current architecture',
      covers: ['file:docs/old.md'],
    },
  ],
};
assert.equal(validateRetirementReceipt(fullyAccounted).retirable, true);

console.log('Branch lifecycle contract verified: stale != superseded != retirable; provider inventory, verified carry-forward destinations, review findings, and residual work must all reconcile to zero.');
