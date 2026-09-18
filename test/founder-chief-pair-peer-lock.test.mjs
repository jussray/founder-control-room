import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const FULL_SHA = /^[0-9a-f]{40}$/;

const [lockText, contractText, workflow, documentationTruth, mergeAuthority, documentationReceiptText] = await Promise.all([
  read('.control-room/founder-chief-pair-peer-lock.json'),
  read('config/founder-chief-pair.contract.json'),
  read('.github/workflows/founder-chief-pair-contract.yml'),
  read('scripts/verify-documentation-truth.mjs'),
  read('docs/FOUNDER_MERGE_AUTHORITY.md'),
  read('docs/DOCUMENTATION_TRUTH_RECEIPT.json'),
]);

const lock = JSON.parse(lockText);
const contract = JSON.parse(contractText);
const documentationReceipt = JSON.parse(documentationReceiptText);

const pairRevalidationPaths = [
  'config/founder-chief-pair.contract.json',
  '.control-room/founder-chief-pair-peer-lock.json',
  'docs/FOUNDER_INTELLIGENCE_CONSTITUTION.md',
  'docs/PUBLIC_COMMUNICATION_TRUTH_CONTRACT.md',
  'package.json',
  'scripts/verify-founder-chief-pair.mjs',
  'src/lib/standingFounderPolicy.ts',
  'src/founder-os-lab/projectAdapters.ts',
  'src/founder-os-lab/capabilityKernel.ts',
  'src/founder-os-lab/engine.ts',
  'src/lib/n8nConveyor.ts',
  'src/lib/n8nConveyorRuntime.ts',
  'automation/n8n/founder-conveyor.workflow.json',
  '.github/workflows/founder-chief-pair-contract.yml',
];

test('candidate peer lock binds the existing Chief pair and policy carriers without granting authority', () => {
  assert.equal(lock.schema, 'fcr/founder-chief-pair-peer-lock@v1');
  assert.equal(lock.repository, 'jussray/founder-control-room');
  assert.equal(lock.scope, 'pull-request-candidate-only');
  assert.equal(lock.founderControlRoom.pullRequest, contract.candidatePairing.founderControlRoomPullRequest);
  assert.equal(lock.chiefAIPair.pullRequest, contract.candidatePairing.chiefAIPullRequest);
  assert.equal(lock.chiefAINecessaryFixPolicy.pullRequest, contract.candidatePairing.chiefAINecessaryFixPolicyPullRequest);
  assert.match(lock.chiefAIPair.expectedHeadSha, FULL_SHA);
  assert.match(lock.chiefAINecessaryFixPolicy.expectedHeadSha, FULL_SHA);
  assert.notEqual(lock.chiefAIPair.expectedHeadSha, lock.chiefAINecessaryFixPolicy.expectedHeadSha);
  assert.equal(lock.authorizesMerge, false);
  assert.equal(lock.authorizesDeployment, false);
  assert.equal(lock.authorizesProviderMutation, false);
  assert.equal(lock.runtimeTruthProven, false);
});

test('pair workflow resolves both live Chief carriers and fails closed on head drift', () => {
  assert.match(workflow, /chiefAIPullRequest/);
  assert.match(workflow, /chiefAINecessaryFixPolicyPullRequest/);
  assert.match(workflow, /test "\$pair_sha" = "\$locked_pair_sha"/);
  assert.match(workflow, /test "\$policy_sha" = "\$locked_policy_sha"/);
  assert.match(workflow, /\.state == "open"/);
  assert.match(workflow, /\.merged_at == null/);
  assert.match(workflow, /git ls-remote --exit-code/);
  assert.match(workflow, /PAIR_NECESSARY_FIX_POLICY_PATH/);
});

test('required pair check reruns for every load-bearing verifier input and stays cheap otherwise', () => {
  assert.match(workflow, /name: Determine whether pair-enforcement truth changed/);
  assert.match(workflow, /required=false/);
  assert.match(workflow, /name: Pair contract unchanged for this pull request/);

  const pairScopeBlock = workflow.split('      - name: Determine whether pair-enforcement truth changed')[1]
    ?.split('      - name: Pair contract unchanged for this pull request')[0] ?? '';
  const pushScopeBlock = workflow.split('  push:')[1]?.split('  workflow_dispatch:')[0] ?? '';

  for (const path of pairRevalidationPaths) {
    assert.ok(pairScopeBlock.includes(path), `${path} must require full pair validation when changed on a PR`);
    assert.ok(pushScopeBlock.includes(path), `${path} must trigger pair validation when changed on main`);
  }
});

test('documentation truth keeps pair authority load-bearing instead of allowing stale green', () => {
  for (const path of [
    'config\\/founder-chief-pair\\.contract\\.json',
    '\\.control-room\\/founder-chief-pair-peer-lock\\.json',
    'scripts\\/verify-founder-chief-pair\\.mjs',
    '\\.github\\/workflows\\/founder-chief-pair-contract\\.yml',
  ]) {
    assert.ok(documentationTruth.includes("domain: 'pair-authority'"), 'documentation truth must retain the pair-authority domain');
    assert.ok(documentationTruth.includes(path), `${path} must remain a pair-authority truth-sensitive surface`);
  }
  assert.match(documentationTruth, /domains\.has\('pair-authority'\).*FOUNDER_MERGE_AUTHORITY/);
  assert.match(mergeAuthority, /verify-pair-contract/);
  assert.match(mergeAuthority, /Standalone-peer pair-check freshness/);
  assert.ok(documentationReceipt.domains.includes('pair-authority'));

  const receiptPaths = new Set(documentationReceipt.changes.map((change) => change.path));
  for (const path of [
    '.control-room/founder-chief-pair-peer-lock.json',
    '.github/workflows/founder-chief-pair-contract.yml',
    'scripts/verify-founder-chief-pair.mjs',
    'scripts/verify-documentation-truth.mjs',
  ]) {
    assert.ok(receiptPaths.has(path), `${path} must retain a current documentation-truth receipt claim`);
  }
});
