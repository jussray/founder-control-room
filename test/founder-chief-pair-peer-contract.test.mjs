import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const contract = JSON.parse(read('config/founder-chief-pair.contract.json'));
const workflow = read('.github/workflows/founder-chief-pair-contract.yml');
const verifier = read('scripts/verify-founder-chief-pair.mjs');

test('both peer identities, receipt state and authority remain independent', () => {
  const r = contract.relationship;
  assert.equal(r.topology, 'standalone-peers');
  for (const side of ['controlRoom', 'chiefAI']) {
    for (const field of ['independentlyCallable', 'ownsIdentity', 'ownsLifecycle', 'ownsReceipts', 'ownsFailureState', 'ownsContinuityMarkers']) {
      assert.equal(r[side][field], true, side + '.' + field);
      assert.ok(verifier.includes(field), 'verifier must enforce ' + field);
    }
  }
  for (const field of ['sharedRuntimeRequired', 'identityCollapseAllowed', 'implicitAuthorityTransferAllowed', 'receiptCollapseAllowed', 'failureCollapseAllowed', 'continuityCollapseAllowed', 'evidenceCreatesAuthority']) {
    assert.equal(r.crossSystem[field], false, field);
    assert.ok(verifier.includes(field), 'verifier must prohibit ' + field);
  }
  assert.equal(r.crossSystem.cooperationMayProceedWithinEachSystemsOwnAuthority, true);
});

test('historical Chief PR candidates are not live peer authority', () => {
  assert.equal(contract.candidatePairing.chiefAIPullRequest, 142);
  assert.equal(contract.candidatePairing.chiefAINecessaryFixPolicyPullRequest, 151);
  assert.ok(contract.candidatePairing.truthBoundary.includes('does not grant merge'));
  assert.ok(contract.candidatePairing.carrierSeparationBoundary.includes('Neither carrier donates'));
  assert.ok(workflow.includes('selected_ref="main"'));
  assert.ok(workflow.includes('source="chief-ai-machine/main"'));
  assert.ok(!workflow.includes('paired-same-name-branch'));
});

test('pair workflow always reports required status, without skipping source changes', () => {
  const betweenEvents = workflow.split('  pull_request:')[1]?.split('  push:')[0];
  assert.equal(betweenEvents?.trim(), '', 'PR workflow may not have a paths gate');
  for (const marker of [
    'Classify exact-head pair-enforcement scope against live main',
    'gh api "repos/${GITHUB_REPOSITORY}/branches/main"',
    'git -C founder-control-room diff --name-only "$live_main_sha" "$EXPECTED_HEAD_SHA"',
    'scripts/verify-founder-chief-pair.mjs',
    "if: steps.pair-scope.outputs.required == 'true'",
    "if: steps.pair-scope.outputs.required != 'true'",
    'node --test test/founder-chief-pair-peer-contract.test.mjs',
  ]) assert.ok(workflow.includes(marker), 'missing workflow marker: ' + marker);
});

test('green evidence and prior heads cannot create authority', () => {
  for (const marker of [
    'mergeCanon.mergeApprovalRequired === true',
    'mergeCanon.approvalCarryForward === false',
    'mergeCanon.reviewOrGreenChecksDoNotAuthorizeMerge === true',
    'mergeCanon.baseOrHeadMovementExpiresApproval === true',
    'requiresExactHeadForRepositoryMutation === true',
    "contract.postingApprovalPolicy?.includes('fresh exact-proposal approval')",
  ]) assert.ok(verifier.includes(marker), 'missing policy guard: ' + marker);
});
