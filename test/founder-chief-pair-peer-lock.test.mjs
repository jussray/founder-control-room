import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const FULL_SHA = /^[0-9a-f]{40}$/;

const [lockText, contractText, workflow, documentationTruth] = await Promise.all([
  read('.control-room/founder-chief-pair-peer-lock.json'),
  read('config/founder-chief-pair.contract.json'),
  read('.github/workflows/founder-chief-pair-contract.yml'),
  read('scripts/verify-documentation-truth.mjs'),
]);

const lock = JSON.parse(lockText);
const contract = JSON.parse(contractText);

test('candidate peer lock binds all Chief carriers without granting authority', () => {
  assert.equal(lock.schema, 'fcr/founder-chief-pair-peer-lock@v1');
  assert.equal(lock.repository, 'jussray/founder-control-room');
  assert.equal(lock.scope, 'pull-request-candidate-only');
  assert.equal(lock.founderControlRoom.pullRequest, contract.candidatePairing.founderControlRoomPullRequest);
  assert.equal(lock.chiefAIPair.pullRequest, contract.candidatePairing.chiefAIPullRequest);
  assert.equal(lock.chiefAINecessaryFixPolicy.pullRequest, contract.candidatePairing.chiefAINecessaryFixPolicyPullRequest);
  assert.equal(lock.chiefAIFounderContentStrategy.repository, 'jussray/chief-ai-machine');
  assert.equal(lock.chiefAIFounderContentStrategy.pullRequest, 128);
  assert.match(lock.chiefAIPair.expectedHeadSha, FULL_SHA);
  assert.match(lock.chiefAINecessaryFixPolicy.expectedHeadSha, FULL_SHA);
  assert.match(lock.chiefAIFounderContentStrategy.expectedHeadSha, FULL_SHA);
  assert.notEqual(lock.chiefAIPair.expectedHeadSha, lock.chiefAINecessaryFixPolicy.expectedHeadSha);
  assert.notEqual(lock.chiefAIPair.expectedHeadSha, lock.chiefAIFounderContentStrategy.expectedHeadSha);
  assert.notEqual(lock.chiefAINecessaryFixPolicy.expectedHeadSha, lock.chiefAIFounderContentStrategy.expectedHeadSha);
  assert.equal(lock.authorizesMerge, false);
  assert.equal(lock.authorizesDeployment, false);
  assert.equal(lock.authorizesProviderMutation, false);
  assert.equal(lock.runtimeTruthProven, false);
});

test('pair workflow fails closed when either live Chief pair-authority head leaves the candidate lock', () => {
  assert.match(workflow, /peer_lock="founder-control-room\/\.control-room\/founder-chief-pair-peer-lock\.json"/);
  assert.match(workflow, /test "\$locked_pair_pr" = "\$chief_pr"/);
  assert.match(workflow, /test "\$locked_policy_pr" = "\$policy_pr"/);
  assert.match(workflow, /test "\$pair_sha" = "\$locked_pair_sha"/);
  assert.match(workflow, /test "\$policy_sha" = "\$locked_policy_sha"/);
  assert.match(workflow, /\.state == "open"/);
  assert.match(workflow, /\.merged_at == null/);
  assert.match(workflow, /git ls-remote --exit-code/);
  assert.doesNotMatch(workflow, /locked_(?:pair|policy)_sha[^\n]*\|\|\s*true/);
});

test('required pair check reports on every PR without coupling unrelated FCR changes to Chief candidate state', () => {
  assert.match(workflow, /on:\n  pull_request:\n  push:/);
  assert.doesNotMatch(workflow, /pull_request:\n    paths:/);
  assert.match(workflow, /name: Determine whether pair-enforcement truth changed/);
  assert.match(workflow, /required=false/);
  assert.match(workflow, /git -C founder-control-room diff --name-only "\$BASE_SHA" "\$HEAD_SHA"/);
  assert.match(workflow, /name: Pair contract unchanged for this pull request/);
  assert.match(workflow, /if: steps\.pair-scope\.outputs\.required != 'true'/);
  assert.match(workflow, /without coupling this unrelated FCR change to Chief candidate state/);

  for (const path of [
    'config/founder-chief-pair.contract.json',
    '.control-room/founder-chief-pair-peer-lock.json',
    'scripts/verify-founder-chief-pair.mjs',
    '.github/workflows/founder-chief-pair-contract.yml',
  ]) {
    assert.ok(workflow.includes(path), `${path} must require full pair validation when changed`);
  }
});

test('Documentation Truth classifies the complete pair-enforcement surface', () => {
  for (const path of [
    'config/founder-chief-pair.contract.json',
    '.control-room/founder-chief-pair-peer-lock.json',
    'scripts/verify-founder-chief-pair.mjs',
    '.github/workflows/founder-chief-pair-contract.yml',
  ]) {
    assert.ok(documentationTruth.includes(path.replaceAll('.', '\\.').replaceAll('/', '\\/')) || documentationTruth.includes(path), `${path} must be truth-sensitive`);
  }
});
