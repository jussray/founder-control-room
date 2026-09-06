import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync('.github/workflows/chief-proofmode-runtime-witness.yml', 'utf8');
const publisher = readFileSync('scripts/publish-chief-runtime-witness.mjs', 'utf8');
const runtimeTest = readFileSync('e2e/chief-proofmode-runtime.pw.mjs', 'utf8');

const FULL_SHA = /\^\[0-9a-f\]\{40\}\$/;

function workflowEnvValue(name) {
  const match = workflow.match(new RegExp(`^\\s{6}${name}:\\s*(.+)$`, 'm'));
  return match?.[1]?.trim() ?? '';
}

test('trusted runtime witness executes only from exact FCR main under founder identity', () => {
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /github\.actor == 'jussray'/);
  assert.match(workflow, /github\.actor_id == '286642846'/);
  assert.match(workflow, /environment:\s*production/);
  assert.match(workflow, /EXPECTED_TRUSTED_MAIN_SHA:\s*\$\{\{ github\.sha \}\}/);
  assert.match(workflow, /test "\$EXPECTED_FOUNDER_MAIN_SHA" = "\$EXPECTED_TRUSTED_MAIN_SHA"/);
  assert.match(workflow, /test "\$EXPECTED_TRUSTED_MAIN_SHA" = "\$current_main"/);
  assert.match(workflow, FULL_SHA);
});

test('witness lane is read-only for Cloudflare Access and cannot perform repair', () => {
  assert.match(workflow, /CHIEF_ACCESS_MODE:\s*check/);
  assert.match(workflow, /CLOUDFLARE_ACCESS_API_TOKEN:\s*\$\{\{ secrets\.CLOUDFLARE_ACCESS_API_TOKEN \}\}/);
  assert.doesNotMatch(workflow, /CLOUDFLARE_ACCESS_ADMIN_API_TOKEN/);
  assert.doesNotMatch(workflow, /CHIEF_ACCESS_MODE:\s*repair/);
  assert.doesNotMatch(workflow, /Apply exact-host Chief Service Auth/);
  assert.match(workflow, /node scripts\/reconcile-chief-proofmode-access\.mjs >\/dev\/null 2>&1/);
});

test('Access check and protected Playwright use the exact same Chief client identity source', () => {
  const checkedClientId = workflowEnvValue('CHIEF_CLOUDFLARE_ACCESS_CLIENT_ID');
  const runtimeClientId = workflowEnvValue('CHIEF_RUNTIME_ACCESS_CLIENT_ID');
  assert.ok(checkedClientId);
  assert.equal(checkedClientId, runtimeClientId);
  assert.match(checkedClientId, /secrets\.CHIEF_CLOUDFLARE_ACCESS_CLIENT_ID/);
  assert.match(checkedClientId, /secrets\.CLOUDFLARE_ACCESS_CLIENT_ID/);
  assert.match(checkedClientId, /vars\.CHIEF_CLOUDFLARE_ACCESS_CLIENT_ID/);
  assert.match(checkedClientId, /vars\.CLOUDFLARE_ACCESS_CLIENT_ID/);
});

test('protected runtime credentials stay in the FCR production secret lane', () => {
  assert.match(workflow, /CHIEF_RUNTIME_ACCESS_CLIENT_SECRET:\s*\$\{\{ secrets\.CHIEF_CLOUDFLARE_ACCESS_CLIENT_SECRET \|\| secrets\.CLOUDFLARE_ACCESS_CLIENT_SECRET \}\}/);
  assert.match(workflow, /CHIEF_RUNTIME_ACCESS_CLIENT_ID:/);
  assert.match(workflow, /Missing protected runtime credential/);
  assert.doesNotMatch(runtimeTest, /console\.log\([^)]*ACCESS_CLIENT_SECRET/i);
  assert.doesNotMatch(publisher, /CHIEF_RUNTIME_ACCESS_CLIENT_SECRET/);
});

test('real protected Playwright runs before any GitHub evidence publication', () => {
  const playwright = workflow.indexOf('Run trusted protected Chief ProofMode Playwright');
  const receipt = workflow.indexOf('Materialize exact protected runtime receipt');
  const publish = workflow.indexOf('Publish and independently read back exact-head runtime evidence');
  assert.ok(playwright >= 0 && receipt > playwright && publish > receipt);
  assert.match(runtimeTest, /serves the exact candidate SHA from \/version/);
  assert.match(runtimeTest, /initializes MCP with the expected ProofMode identity/);
  assert.match(runtimeTest, /advertises only the read-only repository audit tool/);
  assert.match(runtimeTest, /keeps the legacy MCP transport POST-only/);
  assert.match(runtimeTest, /audits the exact public Chief head without mutation authority/);
});

test('GitHub App publication identity is protected and fixed', () => {
  assert.match(workflow, /GITHUB_APP_ID:\s*\$\{\{ secrets\.APP_ID \}\}/);
  assert.match(workflow, /GITHUB_PRIVATE_KEY:\s*\$\{\{ secrets\.APP_PRIVATE_KEY \}\}/);
  assert.match(publisher, /repository:\s*'jussray\/chief-ai-machine'/);
  assert.match(publisher, /pullRequestNumber:\s*143/);
  assert.match(publisher, /rulesetId:\s*20818149/);
  assert.match(publisher, /checkName:\s*'Verify candidate ProofMode runtime with Playwright'/);
  assert.match(publisher, /deploymentEnvironment:\s*'proofmode-access-admin'/);
  assert.match(publisher, /permissions\.checks !== 'write'/);
  assert.match(publisher, /permissions\.deployments !== 'write'/);
});

test('publisher re-observes #208 and forbids bypass or ruleset mutation', () => {
  assert.match(publisher, /Chief ruleset must preserve zero bypass actors/);
  assert.match(publisher, /reserved candidate runtime context must remain unbound/);
  assert.match(publisher, /Chief required deployment missing/);
  assert.match(publisher, /Chief ruleset changed during runtime witness publication/);
  assert.doesNotMatch(publisher, /method:\s*'PUT'.*rulesets/s);
  assert.doesNotMatch(publisher, /method:\s*'PATCH'.*rulesets/s);
  assert.doesNotMatch(publisher, /\/merges|merge_pull_request|updateRepoRuleset/i);
});

test('failed witness cannot leave merge-relevant evidence green without compensation', () => {
  assert.match(publisher, /status:\s*'in_progress'/);
  assert.match(publisher, /conclusion:\s*'failure'/);
  assert.match(publisher, /state:\s*'failure'/);
  assert.match(publisher, /invalidated/);
  assert.match(publisher, /deploymentSuccessPostedByThisCall/);
  assert.match(publisher, /checkFinalizedByThisCall/);
});

test('evidence deployment cannot auto-merge or claim production deployment authority', () => {
  assert.match(publisher, /auto_merge:\s*false/);
  assert.match(publisher, /required_contexts:\s*\[\]/);
  assert.match(publisher, /transient_environment:\s*true/);
  assert.match(publisher, /production_environment:\s*false/);
  assert.match(publisher, /authority:\s*\{[\s\S]*merge:\s*false,[\s\S]*deploy:\s*false,[\s\S]*rulesetMutation:\s*false,[\s\S]*bypass:\s*false/);
});
