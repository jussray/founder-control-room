import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const contract = JSON.parse(
  await readFile(new URL('../.control-room/founder-control.contract.json', import.meta.url), 'utf8'),
);

const lifecycle = contract.workLifecycle;
assert.ok(lifecycle, 'workLifecycle contract is required');
for (const rule of [
  'staleDoesNotImplySuperseded',
  'similarityMayOnlyCreateCandidate',
  'commitAncestryIsMovementNotSemanticProof',
  'closureRequiresExplicitReplacementRelation',
  'replacementGraphMustBeAcyclic',
  'closureRequiresProviderInventory',
  'inventoryCoverageMustBeComplete',
  'inventoryCoverageMustBeSingleDisposition',
  'closureRequiresCompleteResidueAudit',
  'closureRequiresZeroUnresolvedRequiredResidue',
  'closureRequiresEnumerableReplacementObligation',
  'closureRequiresPreservedOutcomeOrAuthorizedCancellation',
  'runtimeSensitiveClosureRequiresCurrentHeadProof',
  'closedHistoricalEvidenceMustRemainRecoverable',
  'orphanedSupersessionReactivatesObligation',
  'structuralReceiptValidationIsNotProviderProof',
  'closureExecutorMustAcquireProviderEvidenceInternally',
  'untrustedCallerReceiptCannotAuthorizeClosure',
]) assert.equal(lifecycle.rules[rule], true, `${rule} must fail closed`);
assert.equal(lifecycle.authorityUnit, 'obligation');
assert.equal(lifecycle.retirementExecutorStatus, 'not-implemented');

const fullSha = /^[0-9a-f]{40}$/i;
const residueKinds = new Set(lifecycle.requiredResidueKinds);
const replacementStates = new Set(['active', 'merged', 'main']);
const outcomeDispositions = new Set(lifecycle.allowedDispositions);

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function replacementGraphHasCycle(edges) {
  const graph = new Map();
  for (const edge of edges ?? []) {
    if (!graph.has(edge.source)) graph.set(edge.source, []);
    graph.get(edge.source).push(edge.replacement);
  }
  const visiting = new Set();
  const visited = new Set();
  function visit(node) {
    if (visiting.has(node)) return true;
    if (visited.has(node)) return false;
    visiting.add(node);
    for (const next of graph.get(node) ?? []) if (visit(next)) return true;
    visiting.delete(node);
    visited.add(node);
    return false;
  }
  return [...graph.keys()].some(visit);
}

/**
 * Structural validation only.
 *
 * This function MUST NOT be used as closure authority. A caller can forge the
 * strings inside inventoryEvidence/replacement. Any future retirement executor
 * has to acquire provider compare/PR evidence inside its own trusted execution,
 * bind that observed evidence to the receipt, then independently authorize the
 * provider mutation. Until that executor exists, authorizesClosure is always
 * false and RepositoryProvider exposes no deleteBranch capability.
 */
export function validateSupersessionReceipt(receipt) {
  const errors = [];
  for (const field of lifecycle.requiredReceiptFields) {
    if (!(field in receipt)) errors.push(`missing:${field}`);
  }

  if (!nonEmpty(receipt.repository)) errors.push('invalid:repository');
  if (!nonEmpty(receipt.sourceRef)) errors.push('invalid:sourceRef');
  for (const field of ['sourceHeadSha', 'currentMainSha']) {
    if (!fullSha.test(receipt[field] ?? '')) errors.push(`invalid:${field}`);
  }
  if (!lifecycle.classifications.includes(receipt.classification)) errors.push('invalid:classification');
  if (!outcomeDispositions.has(receipt.outcomeDisposition)) errors.push('invalid:outcomeDisposition');

  const inventoryTokens = new Set();
  const inventory = receipt.inventoryEvidence;
  if (!inventory || inventory.source !== lifecycle.inventorySource) {
    errors.push('invalid:inventoryEvidence');
  } else {
    for (const field of ['sourceHeadSha', 'currentMainSha']) {
      if (inventory[field] !== receipt[field]) errors.push(`inventory-mismatch:${field}`);
    }
    for (const sha of inventory.uniqueCommitShas ?? []) {
      if (!fullSha.test(sha)) errors.push(`invalid-inventory-commit:${sha}`);
      else if (inventoryTokens.has(`commit:${sha}`)) errors.push(`duplicate-inventory:commit:${sha}`);
      else inventoryTokens.add(`commit:${sha}`);
    }
    for (const path of inventory.uniqueFiles ?? []) {
      if (!nonEmpty(path)) errors.push(`invalid-inventory-file:${path}`);
      else if (inventoryTokens.has(`file:${path}`)) errors.push(`duplicate-inventory:file:${path}`);
      else inventoryTokens.add(`file:${path}`);
    }
  }

  const cancelled = receipt.outcomeDisposition === 'founder-cancelled';
  const replacement = receipt.replacement;
  if (!cancelled) {
    if (!replacement || typeof replacement !== 'object') errors.push('missing:replacement');
    else {
      if (replacement.source !== lifecycle.replacementEvidenceSource) errors.push('invalid:replacement.source');
      if (!nonEmpty(replacement.repository)) errors.push('invalid:replacement.repository');
      if (!nonEmpty(replacement.ref)) errors.push('invalid:replacement.ref');
      if (!fullSha.test(replacement.headSha ?? '')) errors.push('invalid:replacement.headSha');
      if (!replacementStates.has(replacement.state)) errors.push('invalid:replacement.state');
      if (replacement.repository === receipt.repository && replacement.ref === receipt.sourceRef) errors.push('self-replacement');
    }
  }

  const coveredTokens = new Set();
  const seenKinds = new Set();
  if (!Array.isArray(receipt.residue)) errors.push('invalid:residue');
  else {
    for (const item of receipt.residue) {
      if (!residueKinds.has(item?.kind)) errors.push(`invalid-residue-kind:${item?.kind}`);
      if (seenKinds.has(item?.kind)) errors.push(`duplicate-residue-kind:${item?.kind}`);
      seenKinds.add(item?.kind);
      if (!['none', 'transferred', 'preserved', 'rejected', 'cancelled'].includes(item?.disposition)) {
        errors.push(`invalid-residue-disposition:${item?.kind}`);
      }
      if (item?.disposition !== 'none' && !nonEmpty(item?.evidence)) errors.push(`missing-residue-evidence:${item?.kind}`);
      for (const token of item?.covers ?? []) {
        if (!inventoryTokens.has(token)) errors.push(`unexpected-coverage:${token}`);
        else if (coveredTokens.has(token)) errors.push(`duplicate-coverage:${token}`);
        else coveredTokens.add(token);
      }
    }
    for (const kind of residueKinds) if (!seenKinds.has(kind)) errors.push(`missing-residue-kind:${kind}`);
  }
  for (const token of inventoryTokens) if (!coveredTokens.has(token)) errors.push(`unaccounted-inventory:${token}`);

  if (!Array.isArray(receipt.unresolvedRequiredResidue)) errors.push('invalid:unresolvedRequiredResidue');
  else if (receipt.unresolvedRequiredResidue.length) errors.push('unresolved-required-residue');
  if (!Array.isArray(receipt.unresolvedReviewFindings)) errors.push('invalid:unresolvedReviewFindings');
  else if (receipt.unresolvedReviewFindings.length) errors.push('unresolved-review-findings');
  if (!Array.isArray(receipt.historicalEvidence) || receipt.historicalEvidence.length === 0) errors.push('missing:historicalEvidence');

  if (receipt.runtimeSensitive === true) {
    const proof = receipt.currentProof;
    if (!proof || proof.headSha !== receipt.currentMainSha || proof.status !== 'passed') errors.push('runtime-proof-not-current');
  }
  if (replacementGraphHasCycle(receipt.replacementEdges)) errors.push('replacement-cycle');

  const structurallyClosable = errors.length === 0;
  if (receipt.safeToClose !== structurallyClosable) errors.push('safeToClose-mismatch');

  return {
    structurallyValid: errors.length === 0,
    structurallyClosable: errors.length === 0,
    providerProvenanceVerified: false,
    authorizesClosure: false,
    errors,
  };
}

const fileToken = 'file:src/security.ts';
const commitSha = 'd'.repeat(40);
const commitToken = `commit:${commitSha}`;
const residue = [...residueKinds].map((kind) => ({
  kind,
  disposition: kind === 'code' ? 'transferred' : 'none',
  evidence: kind === 'code' ? 'replacement exact-head diff' : undefined,
  covers: kind === 'code' ? [fileToken, commitToken] : [],
}));
const base = {
  repository: 'jussray/example',
  sourceRef: 'pull/1',
  sourceHeadSha: 'a'.repeat(40),
  currentMainSha: 'b'.repeat(40),
  classification: 'supersession-verified',
  inventoryEvidence: {
    source: 'provider-compare-plus-pr-readback',
    sourceHeadSha: 'a'.repeat(40),
    currentMainSha: 'b'.repeat(40),
    uniqueCommitShas: [commitSha],
    uniqueFiles: ['src/security.ts'],
  },
  replacement: { source: 'provider-readback', repository: 'jussray/example', ref: 'pull/2', headSha: 'c'.repeat(40), state: 'active' },
  residue,
  unresolvedRequiredResidue: [],
  unresolvedReviewFindings: [],
  currentProof: { headSha: 'b'.repeat(40), status: 'passed' },
  historicalEvidence: ['source-pr@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],
  outcomeDisposition: 'carried-forward',
  runtimeSensitive: false,
  replacementEdges: [{ source: 'pull/1', replacement: 'pull/2' }],
  safeToClose: true,
};

const validStructure = validateSupersessionReceipt(base);
assert.equal(validStructure.structurallyClosable, true);
assert.equal(validStructure.providerProvenanceVerified, false);
assert.equal(validStructure.authorizesClosure, false);
assert.equal(validateSupersessionReceipt({ ...base, unresolvedRequiredResidue: ['migration'], safeToClose: false }).structurallyClosable, false);
assert.equal(validateSupersessionReceipt({ ...base, replacement: { ...base.replacement, state: 'stale' }, safeToClose: false }).structurallyClosable, false);
assert.equal(validateSupersessionReceipt({ ...base, runtimeSensitive: true, currentProof: { headSha: 'e'.repeat(40), status: 'passed' }, safeToClose: false }).structurallyClosable, false);
assert.equal(validateSupersessionReceipt({ ...base, replacementEdges: [{ source: 'pull/1', replacement: 'pull/2' }, { source: 'pull/2', replacement: 'pull/1' }], safeToClose: false }).structurallyClosable, false);
assert.equal(validateSupersessionReceipt({ ...base, residue: base.residue.map((item) => item.kind === 'code' ? { ...item, covers: [fileToken] } : item), safeToClose: false }).structurallyClosable, false);
assert.equal(validateSupersessionReceipt({ ...base, replacement: null, outcomeDisposition: 'founder-cancelled', safeToClose: true }).structurallyClosable, true);

console.log('Work supersession contract verified: structural receipts are non-authorizing; provider evidence must be acquired inside a future trusted retirement executor, while inventory coverage, residue, replacement provenance, current proof, and history fail closed.');
