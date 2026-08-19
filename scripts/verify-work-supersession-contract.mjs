import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const contract = JSON.parse(
  await readFile(new URL('../.control-room/founder-control.contract.json', import.meta.url), 'utf8'),
);

const lifecycle = contract.workLifecycle;
assert.ok(lifecycle, 'workLifecycle contract is required');
assert.equal(lifecycle.authorityUnit, 'obligation');
assert.equal(lifecycle.rules.staleDoesNotImplySuperseded, true);
assert.equal(lifecycle.rules.similarityMayOnlyCreateCandidate, true);
assert.equal(lifecycle.rules.commitAncestryIsMovementNotSemanticProof, true);
assert.equal(lifecycle.rules.closureRequiresExplicitReplacementRelation, true);
assert.equal(lifecycle.rules.replacementGraphMustBeAcyclic, true);
assert.equal(lifecycle.rules.closureRequiresCompleteResidueAudit, true);
assert.equal(lifecycle.rules.closureRequiresZeroUnresolvedRequiredResidue, true);
assert.equal(lifecycle.rules.closureRequiresEnumerableReplacementObligation, true);
assert.equal(lifecycle.rules.closureRequiresPreservedOutcomeOrAuthorizedCancellation, true);
assert.equal(lifecycle.rules.runtimeSensitiveClosureRequiresCurrentHeadProof, true);
assert.equal(lifecycle.rules.closedHistoricalEvidenceMustRemainRecoverable, true);
assert.equal(lifecycle.rules.orphanedSupersessionReactivatesObligation, true);

const fullSha = /^[0-9a-f]{40}$/i;
const requiredResidueKinds = new Set(lifecycle.requiredResidueKinds);
const terminalReplacementStates = new Set(['active', 'merged', 'main']);
const authorizedOutcomeDispositions = new Set([
  'integrated',
  'superseded',
  'carried-forward',
  'intentionally-rejected',
  'founder-cancelled',
]);

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function replacementGraphHasCycle(edges) {
  const next = new Map(edges.map(({ source, replacement }) => [source, replacement]));
  for (const start of next.keys()) {
    const seen = new Set();
    let cursor = start;
    while (next.has(cursor)) {
      if (seen.has(cursor)) return true;
      seen.add(cursor);
      cursor = next.get(cursor);
    }
  }
  return false;
}

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

  if (!lifecycle.classifications.includes(receipt.classification)) {
    errors.push('invalid:classification');
  }

  const replacement = receipt.replacement;
  const cancelled = receipt.outcomeDisposition === 'founder-cancelled';
  if (!cancelled) {
    if (!replacement || typeof replacement !== 'object') {
      errors.push('missing:replacement');
    } else {
      if (replacement.source !== lifecycle.replacementEvidenceSource) errors.push('invalid:replacement.source');
      if (!nonEmpty(replacement.repository)) errors.push('invalid:replacement.repository');
      if (!nonEmpty(replacement.ref)) errors.push('invalid:replacement.ref');
      if (!fullSha.test(replacement.headSha ?? '')) errors.push('invalid:replacement.headSha');
      if (!terminalReplacementStates.has(replacement.state)) errors.push('invalid:replacement.state');
      if (replacement.ref === receipt.sourceRef && replacement.repository === receipt.repository) {
        errors.push('self-replacement');
      }
    }
  }

  if (!authorizedOutcomeDispositions.has(receipt.outcomeDisposition)) {
    errors.push('invalid:outcomeDisposition');
  }

  if (!Array.isArray(receipt.residue)) {
    errors.push('invalid:residue');
  } else {
    const seenKinds = new Set();
    for (const item of receipt.residue) {
      if (!requiredResidueKinds.has(item?.kind)) errors.push(`invalid-residue-kind:${item?.kind}`);
      if (seenKinds.has(item?.kind)) errors.push(`duplicate-residue-kind:${item?.kind}`);
      seenKinds.add(item?.kind);
      if (!['none', 'transferred', 'preserved', 'rejected', 'cancelled'].includes(item?.disposition)) {
        errors.push(`invalid-residue-disposition:${item?.kind}`);
      }
      if (item?.disposition !== 'none' && !nonEmpty(item?.evidence)) {
        errors.push(`missing-residue-evidence:${item?.kind}`);
      }
    }
    for (const kind of requiredResidueKinds) {
      if (!seenKinds.has(kind)) errors.push(`missing-residue-kind:${kind}`);
    }
  }

  if (!Array.isArray(receipt.unresolvedRequiredResidue)) {
    errors.push('invalid:unresolvedRequiredResidue');
  } else if (receipt.unresolvedRequiredResidue.length > 0) {
    errors.push('unresolved-required-residue');
  }

  if (!Array.isArray(receipt.unresolvedReviewFindings)) {
    errors.push('invalid:unresolvedReviewFindings');
  } else if (receipt.unresolvedReviewFindings.length > 0) {
    errors.push('unresolved-review-findings');
  }

  if (!Array.isArray(receipt.historicalEvidence)) {
    errors.push('invalid:historicalEvidence');
  } else if (receipt.historicalEvidence.length === 0) {
    errors.push('missing:historicalEvidence');
  }

  const proof = receipt.currentProof;
  if (receipt.runtimeSensitive === true) {
    if (!proof || proof.headSha !== receipt.currentMainSha || proof.status !== 'passed') {
      errors.push('runtime-proof-not-current');
    }
  }

  if (Array.isArray(receipt.replacementEdges) && replacementGraphHasCycle(receipt.replacementEdges)) {
    errors.push('replacement-cycle');
  }

  const semanticallyClosable = errors.length === 0;
  if (receipt.safeToClose !== semanticallyClosable) errors.push('safeToClose-mismatch');

  return { safeToClose: errors.length === 0, errors };
}

const completeResidue = [...requiredResidueKinds].map((kind) => ({ kind, disposition: 'none' }));
const base = {
  repository: 'jussray/example',
  sourceRef: 'pull/1',
  sourceHeadSha: 'a'.repeat(40),
  currentMainSha: 'b'.repeat(40),
  classification: 'supersession-verified',
  replacement: {
    source: 'provider-readback',
    repository: 'jussray/example',
    ref: 'pull/2',
    headSha: 'c'.repeat(40),
    state: 'active',
  },
  residue: completeResidue,
  unresolvedRequiredResidue: [],
  unresolvedReviewFindings: [],
  currentProof: { headSha: 'b'.repeat(40), status: 'passed' },
  historicalEvidence: ['source-pr@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],
  outcomeDisposition: 'carried-forward',
  runtimeSensitive: false,
  replacementEdges: [{ source: 'pull/1', replacement: 'pull/2' }],
  safeToClose: true,
};

assert.equal(validateSupersessionReceipt(base).safeToClose, true);
assert.equal(validateSupersessionReceipt({ ...base, unresolvedRequiredResidue: ['migration'], safeToClose: false }).safeToClose, false);
assert.equal(validateSupersessionReceipt({ ...base, replacement: { ...base.replacement, state: 'stale' }, safeToClose: false }).safeToClose, false);
assert.equal(validateSupersessionReceipt({ ...base, runtimeSensitive: true, currentProof: { headSha: 'd'.repeat(40), status: 'passed' }, safeToClose: false }).safeToClose, false);
assert.equal(validateSupersessionReceipt({ ...base, replacementEdges: [{ source: 'pull/1', replacement: 'pull/2' }, { source: 'pull/2', replacement: 'pull/1' }], safeToClose: false }).safeToClose, false);
assert.equal(validateSupersessionReceipt({ ...base, replacement: null, outcomeDisposition: 'founder-cancelled', safeToClose: true }).safeToClose, true);

console.log('Work supersession contract verified: obligations survive containers; closure requires zero residue, current proof when runtime-sensitive, acyclic replacement provenance, and recoverable history.');
