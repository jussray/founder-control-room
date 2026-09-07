import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const verifier = readFileSync('scripts/verify-documentation-truth.mjs', 'utf8');
const runbook = readFileSync('docs/CHIEF_PROOFMODE_ACCESS_RECOVERY.md', 'utf8');
const receipt = JSON.parse(readFileSync('docs/DOCUMENTATION_TRUTH_RECEIPT.json', 'utf8'));

const authorityPaths = [
  '.github/workflows/chief-proofmode-access-command-bridge.yml',
  '.github/workflows/chief-proofmode-access-recovery.yml',
  '.github/workflows/chief-proofmode-runtime-witness.yml',
  'scripts/reconcile-chief-proofmode-access.mjs',
  'scripts/resolve-chief-proofmode-access-selector.mjs',
  'scripts/chief-proofmode-access-reconciliation-state.mjs',
];

test('Documentation Truth registers the operational Chief Access authority surface', () => {
  assert.match(verifier, /domain: 'chief-access-authority'/);
  assert.match(verifier, /chief-proofmode-\(\?:access-command-bridge\|access-recovery\|runtime-witness\)/);
  assert.match(verifier, /reconcile-chief-proofmode-access\|resolve-chief-proofmode-access-selector\|chief-proofmode-access-reconciliation-state/);
  assert.match(
    verifier,
    /domains\.has\('chief-access-authority'\).*requiredDocs\.add\('docs\/CHIEF_PROOFMODE_ACCESS_RECOVERY\.md'\)/s,
  );
  assert.match(verifier, /documentation truth receipt must name a meaningful path-bound invariant for:/);
});

test('current documentation receipt binds every Chief Access authority source', () => {
  assert.ok(receipt.domains.includes('chief-access-authority'));
  assert.ok(receipt.domains.includes('truth-governance'));

  const changes = new Map(receipt.changes.map((entry) => [entry.path, entry.claims]));
  for (const path of authorityPaths) {
    const claims = changes.get(path);
    assert.ok(Array.isArray(claims) && claims.length > 0, `missing path-bound receipt claim for ${path}`);
    assert.ok(claims.some((claim) => claim.includes(path)), `receipt claim must bind exact path ${path}`);
  }
  const verifierClaims = changes.get('scripts/verify-documentation-truth.mjs');
  assert.ok(Array.isArray(verifierClaims) && verifierClaims.some((claim) => claim.includes('chief-access-authority')));
});

test('Chief Access runbook records the founder-bound reusable-workflow membrane', () => {
  assert.match(runbook, /issue-comment bridge is the only invocation surface/);
  assert.match(runbook, /reusable through `workflow_call`/);
  assert.match(runbook, /has no direct `workflow_dispatch` trigger/);
  assert.match(runbook, /rebinds the original `issue_comment` event/);
  assert.match(runbook, /before any provider credential can be used/);
});