import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const FULL_SHA = /^[0-9a-f]{40}$/;

const [lockText, contractText, workflow] = await Promise.all([
  read('.control-room/founder-chief-pair-peer-lock.json'),
  read('config/founder-chief-pair.contract.json'),
  read('.github/workflows/founder-chief-pair-contract.yml'),
]);

const lock = JSON.parse(lockText);
const contract = JSON.parse(contractText);

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

test('required pair check remains cheap for unrelated pull requests', () => {
  assert.match(workflow, /name: Determine whether pair-enforcement truth changed/);
  assert.match(workflow, /required=false/);
  assert.match(workflow, /name: Pair contract unchanged for this pull request/);
  for (const path of [
    'config/founder-chief-pair.contract.json',
    '.control-room/founder-chief-pair-peer-lock.json',
    'scripts/verify-founder-chief-pair.mjs',
    '.github/workflows/founder-chief-pair-contract.yml',
  ]) {
    assert.ok(workflow.includes(path), `${path} must require full pair validation when changed`);
  }
});
