import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CHIEF_RUNTIME_WITNESS,
  publishChiefRuntimeWitness,
  validateChiefRuleset,
  validateChiefRulesetUnchanged,
  validateInstallationUnchanged,
  validateRuntimeReceipt,
} from './publish-chief-runtime-witness.mjs';

const FCR_MAIN = '351a6628a4fa3eda1765bfac2d5bf4ccca660af9';
const CHIEF_HEAD = '7c85639de27ac28b74c0b39868a69a6d4cd4b89c';
const TARGET = 'https://1235e5e6-chief-ai.mcgill-raylene.workers.dev';
const APP_ID = '900001';

function runtimeReceipt() {
  return {
    schema: 'fcr/chief-runtime-playwright@v1',
    trustedFcrMainSha: FCR_MAIN,
    chiefCandidateSha: CHIEF_HEAD,
    targetOrigin: TARGET,
    versionVerified: true,
    playwrightPassed: true,
    proofModeVerified: true,
    workflowRunUrl: 'https://github.com/jussray/founder-control-room/actions/runs/123456789',
    generatedAt: '2026-09-06T05:30:00.000Z',
  };
}

function ruleset() {
  return {
    id: 20818149,
    name: 'Chief AI main exact-head gate',
    target: 'branch',
    enforcement: 'active',
    bypass_actors: [],
    conditions: { ref_name: { include: ['~DEFAULT_BRANCH'], exclude: [] } },
    rules: [
      {
        type: 'required_status_checks',
        parameters: {
          required_status_checks: [
            { context: 'Typecheck' },
            { context: 'Lint' },
            { context: 'Unit Tests' },
            { context: 'SonarQube – Founder Intelligence' },
            { context: 'Verify test-ledger contract' },
          ],
        },
      },
      {
        type: 'required_deployments',
        parameters: {
          required_deployment_environments: ['Cloudflare Production', 'proofmode-access-admin'],
        },
      },
    ],
  };
}

function pr() {
  return {
    number: 143,
    state: 'open',
    base: { ref: 'main' },
    head: {
      sha: CHIEF_HEAD,
      repo: { full_name: 'jussray/chief-ai-machine', name: 'chief-ai-machine' },
    },
  };
}

function env() {
  return {
    EXPECTED_TRUSTED_MAIN_SHA: FCR_MAIN,
    CHIEF_CANDIDATE_SHA: CHIEF_HEAD,
    CHIEF_RUNTIME_TARGET_URL: TARGET,
    RUNTIME_WITNESS_APPROVAL_REFERENCE: 'founder-approved-3000',
    RUNTIME_RECEIPT_PATH: 'test-results/chief-runtime.json',
    GITHUB_APP_ID: APP_ID,
    GITHUB_PRIVATE_KEY: 'test-private-key',
  };
}

function response(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function installation(overrides = {}) {
  return {
    repository: 'jussray/chief-ai-machine',
    appId: APP_ID,
    installationId: '7654321',
    repositorySelection: 'selected',
    permissions: { checks: 'write', deployments: 'write' },
    ...overrides,
  };
}

function providerHarness({ secondRuleset = ruleset() } = {}) {
  let check = null;
  let deployment = null;
  const deploymentStatuses = [];
  const calls = [];
  let rulesetReads = 0;

  const fetchFn = async (url, options = {}) => {
    const method = options.method || 'GET';
    const pathname = new URL(url).pathname;
    calls.push({ method, pathname, body: options.body ? JSON.parse(options.body) : null });

    if (method === 'GET' && pathname.endsWith('/pulls/143')) return response(pr());
    if (method === 'GET' && pathname.endsWith('/rulesets/20818149')) {
      rulesetReads += 1;
      return response(rulesetReads === 1 ? ruleset() : secondRuleset);
    }

    if (method === 'GET' && pathname.endsWith(`/commits/${CHIEF_HEAD}/check-runs`)) {
      return response({
        check_runs: check
          ? [{ ...check, id: 42, head_sha: CHIEF_HEAD, app: { id: Number(APP_ID) } }]
          : [],
      });
    }
    if (method === 'POST' && pathname.endsWith('/check-runs')) {
      check = { id: 42, ...JSON.parse(options.body), head_sha: CHIEF_HEAD, app: { id: Number(APP_ID) } };
      return response(check, 201);
    }
    if (method === 'PATCH' && pathname.endsWith('/check-runs/42')) {
      check = { ...check, ...JSON.parse(options.body), id: 42, head_sha: CHIEF_HEAD, app: { id: Number(APP_ID) } };
      return response(check);
    }

    if (method === 'GET' && pathname.endsWith('/deployments')) {
      return response(deployment
        ? [{ id: 77, sha: CHIEF_HEAD, environment: CHIEF_RUNTIME_WITNESS.deploymentEnvironment, payload: deployment.payload }]
        : []);
    }
    if (method === 'POST' && pathname.endsWith('/deployments')) {
      deployment = JSON.parse(options.body);
      return response({ id: 77, ...deployment, sha: CHIEF_HEAD }, 201);
    }

    if (method === 'GET' && pathname.endsWith('/deployments/77/statuses')) {
      return response(deploymentStatuses);
    }
    if (method === 'POST' && pathname.endsWith('/deployments/77/statuses')) {
      const status = { id: 88 + deploymentStatuses.length, ...JSON.parse(options.body) };
      deploymentStatuses.unshift(status);
      return response(status, 201);
    }

    throw new Error(`unexpected ${method} ${url}`);
  };

  return {
    fetchFn,
    calls,
    getCheck: () => check,
    getDeployment: () => deployment,
    getDeploymentStatuses: () => deploymentStatuses,
    getRulesetReads: () => rulesetReads,
  };
}

test('runtime witness contract is fixed to Chief #143, the reserved context, and proofmode-access-admin', () => {
  assert.equal(CHIEF_RUNTIME_WITNESS.repository, 'jussray/chief-ai-machine');
  assert.equal(CHIEF_RUNTIME_WITNESS.pullRequestNumber, 143);
  assert.equal(CHIEF_RUNTIME_WITNESS.rulesetId, 20818149);
  assert.equal(CHIEF_RUNTIME_WITNESS.checkName, 'Verify candidate ProofMode runtime with Playwright');
  assert.equal(CHIEF_RUNTIME_WITNESS.deploymentEnvironment, 'proofmode-access-admin');
});

test('receipt validation rejects incomplete or cross-head runtime proof', () => {
  const expected = {
    trustedFcrMainSha: FCR_MAIN,
    chiefCandidateSha: CHIEF_HEAD,
    targetOrigin: TARGET,
  };
  assert.equal(validateRuntimeReceipt(runtimeReceipt(), expected).playwrightPassed, true);
  assert.throws(
    () => validateRuntimeReceipt({ ...runtimeReceipt(), chiefCandidateSha: '0'.repeat(40) }, expected),
    /candidate mismatch/,
  );
  assert.throws(
    () => validateRuntimeReceipt({ ...runtimeReceipt(), playwrightPassed: false }, expected),
    /not fully verified/,
  );
});

test('ruleset validation fails closed on bypass, deployment drift, or premature candidate-context binding', () => {
  assert.equal(validateChiefRuleset(ruleset()).id, 20818149);
  assert.throws(() => validateChiefRuleset({ ...ruleset(), bypass_actors: [{ actor_id: 1 }] }), /zero bypass/);

  const missingDeployment = ruleset();
  missingDeployment.rules[1].parameters.required_deployment_environments = ['Cloudflare Production'];
  assert.throws(() => validateChiefRuleset(missingDeployment), /proofmode-access-admin/);

  const prematureContext = ruleset();
  prematureContext.rules[0].parameters.required_status_checks.push({
    context: 'Verify candidate ProofMode runtime with Playwright',
  });
  assert.throws(() => validateChiefRuleset(prematureContext), /reserved candidate runtime context/);
});

test('post-publication ruleset freshness rejects any provider-state drift even when core invariants still pass', () => {
  const initial = ruleset();
  const changed = structuredClone(initial);
  changed.rules[0].parameters.required_status_checks.push({ context: 'Another still-valid check' });

  assert.equal(validateChiefRulesetUnchanged(initial, structuredClone(initial)).id, 20818149);
  assert.throws(
    () => validateChiefRulesetUnchanged(initial, changed),
    /changed during runtime witness publication/,
  );
});

test('post-publication installation freshness rejects App installation identity or repository-scope drift', () => {
  assert.equal(
    validateInstallationUnchanged(installation(), installation(), APP_ID).installationId,
    '7654321',
  );
  assert.throws(
    () => validateInstallationUnchanged(installation(), installation({ installationId: '7654322' }), APP_ID),
    /installation identity changed/,
  );
  assert.throws(
    () => validateInstallationUnchanged(installation(), installation({ repositorySelection: 'all' }), APP_ID),
    /repository selection changed/,
  );
});

test('publisher performs zero GitHub mutations when App deployment authority is absent', async () => {
  const calls = [];
  await assert.rejects(
    publishChiefRuntimeWitness({
      env: env(),
      readFileFn: async () => JSON.stringify(runtimeReceipt()),
      observeInstallationFn: async () => installation({ permissions: { checks: 'write', deployments: 'read' } }),
      getInstallationTokenFn: async () => 'token',
      fetchFn: async (url, options = {}) => {
        calls.push({ url, method: options.method || 'GET' });
        return response({});
      },
      writeArtifactFn: async () => {},
    }),
    /deployments:write/,
  );
  assert.equal(calls.length, 0);
});

test('ruleset drift before finalization leaves no successful Check Run or deployment status', async () => {
  const changed = ruleset();
  changed.rules[0].parameters.required_status_checks.push({ context: 'Drifted during publication' });
  const harness = providerHarness({ secondRuleset: changed });

  await assert.rejects(
    publishChiefRuntimeWitness({
      env: env(),
      readFileFn: async () => JSON.stringify(runtimeReceipt()),
      observeInstallationFn: async () => installation(),
      getInstallationTokenFn: async () => 'token',
      fetchFn: harness.fetchFn,
      writeArtifactFn: async () => {},
    }),
    /changed during runtime witness publication/,
  );

  assert.equal(harness.getCheck().status, 'in_progress');
  assert.equal(harness.getCheck().conclusion, undefined);
  assert.equal(harness.getDeploymentStatuses().length, 0);
  assert.equal(harness.calls.some((call) => call.method === 'PATCH'), false);
});

test('successful publisher finalizes fixed check before the authority-significant deployment success', async () => {
  const harness = providerHarness();
  let artifact = null;
  let installationReads = 0;

  const result = await publishChiefRuntimeWitness({
    env: env(),
    readFileFn: async () => JSON.stringify(runtimeReceipt()),
    observeInstallationFn: async () => {
      installationReads += 1;
      return installation();
    },
    getInstallationTokenFn: async () => 'token',
    fetchFn: harness.fetchFn,
    writeArtifactFn: async (value) => { artifact = value; },
  });

  assert.equal(result.status, 'verified-published');
  assert.equal(result.authority.merge, false);
  assert.equal(result.authority.deploy, false);
  assert.equal(result.authority.rulesetMutation, false);
  assert.equal(result.check.issuerAppId, APP_ID);
  assert.equal(result.deployment.environment, 'proofmode-access-admin');
  assert.equal(artifact.receiptHash, harness.getCheck().external_id);
  assert.equal(harness.getDeployment().payload.receiptHash, harness.getCheck().external_id);
  assert.equal(harness.getDeploymentStatuses()[0].state, 'success');
  assert.match(harness.getDeploymentStatuses()[0].description, new RegExp(harness.getCheck().external_id.slice(0, 12)));
  assert.equal(harness.calls.filter((call) => call.method === 'POST').length, 3);
  assert.equal(harness.calls.filter((call) => call.method === 'PATCH').length, 1);
  assert.equal(harness.calls.filter((call) => call.pathname.endsWith('/pulls/143')).length, 2);
  assert.equal(harness.getRulesetReads(), 2);
  assert.equal(installationReads, 2);

  const patchIndex = harness.calls.findIndex((call) => call.method === 'PATCH' && call.pathname.endsWith('/check-runs/42'));
  const successDeploymentIndex = harness.calls.findIndex((call) =>
    call.method === 'POST'
    && call.pathname.endsWith('/deployments/77/statuses')
    && call.body?.state === 'success');
  assert.ok(patchIndex >= 0 && successDeploymentIndex > patchIndex);
});

test('failure after provider green compensates both merge-relevant signals back to failure', async () => {
  const harness = providerHarness();

  await assert.rejects(
    publishChiefRuntimeWitness({
      env: env(),
      readFileFn: async () => JSON.stringify(runtimeReceipt()),
      observeInstallationFn: async () => installation(),
      getInstallationTokenFn: async () => 'token',
      fetchFn: harness.fetchFn,
      writeArtifactFn: async () => { throw new Error('artifact persistence failed'); },
    }),
    /artifact persistence failed/,
  );

  assert.equal(harness.getCheck().status, 'completed');
  assert.equal(harness.getCheck().conclusion, 'failure');
  assert.equal(harness.getDeploymentStatuses()[0].state, 'failure');
  assert.match(harness.getDeploymentStatuses()[0].description, /invalidated/);
  assert.equal(harness.getDeploymentStatuses()[1].state, 'success');

  const failurePatch = harness.calls.find((call) =>
    call.method === 'PATCH'
    && call.pathname.endsWith('/check-runs/42')
    && call.body?.conclusion === 'failure');
  const failureDeployment = harness.calls.find((call) =>
    call.method === 'POST'
    && call.pathname.endsWith('/deployments/77/statuses')
    && call.body?.state === 'failure');
  assert.ok(failurePatch);
  assert.ok(failureDeployment);
});
