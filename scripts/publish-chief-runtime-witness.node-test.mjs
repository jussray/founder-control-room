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
    () => validateInstallationUnchanged(
      installation(),
      installation({ installationId: '7654322' }),
      APP_ID,
    ),
    /installation identity changed/,
  );
  assert.throws(
    () => validateInstallationUnchanged(
      installation(),
      installation({ repositorySelection: 'all' }),
      APP_ID,
    ),
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

test('publisher creates fixed evidence and re-observes Chief PR, ruleset, and App installation before verified-published', async () => {
  let publishedCheck = null;
  let publishedDeployment = null;
  let publishedStatus = null;
  const calls = [];
  let artifact = null;
  let installationReads = 0;
  let rulesetReads = 0;

  const fetchFn = async (url, options = {}) => {
    const method = options.method || 'GET';
    const pathname = new URL(url).pathname;
    calls.push({ method, pathname });

    if (method === 'GET' && pathname.endsWith('/pulls/143')) return response(pr());
    if (method === 'GET' && pathname.endsWith('/rulesets/20818149')) {
      rulesetReads += 1;
      return response(ruleset());
    }

    if (method === 'GET' && pathname.endsWith(`/commits/${CHIEF_HEAD}/check-runs`)) {
      return response({
        check_runs: publishedCheck
          ? [{
              id: 42,
              ...publishedCheck,
              head_sha: publishedCheck.head_sha,
              app: { id: Number(APP_ID) },
            }]
          : [],
      });
    }
    if (method === 'POST' && pathname.endsWith('/check-runs')) {
      publishedCheck = JSON.parse(options.body);
      assert.equal(publishedCheck.name, CHIEF_RUNTIME_WITNESS.checkName);
      assert.equal(publishedCheck.head_sha, CHIEF_HEAD);
      assert.equal(publishedCheck.conclusion, 'success');
      return response({ id: 42 }, 201);
    }

    if (method === 'GET' && pathname.endsWith('/deployments')) {
      return response(publishedDeployment
        ? [{
            id: 77,
            sha: CHIEF_HEAD,
            environment: CHIEF_RUNTIME_WITNESS.deploymentEnvironment,
            payload: publishedDeployment.payload,
          }]
        : []);
    }
    if (method === 'POST' && pathname.endsWith('/deployments')) {
      publishedDeployment = JSON.parse(options.body);
      assert.equal(publishedDeployment.ref, CHIEF_HEAD);
      assert.equal(publishedDeployment.environment, CHIEF_RUNTIME_WITNESS.deploymentEnvironment);
      assert.equal(publishedDeployment.auto_merge, false);
      return response({ id: 77, ...publishedDeployment, sha: CHIEF_HEAD }, 201);
    }

    if (method === 'GET' && pathname.endsWith('/deployments/77/statuses')) {
      return response(publishedStatus ? [{ id: 88, ...publishedStatus }] : []);
    }
    if (method === 'POST' && pathname.endsWith('/deployments/77/statuses')) {
      publishedStatus = JSON.parse(options.body);
      assert.equal(publishedStatus.state, 'success');
      assert.equal(publishedStatus.environment, CHIEF_RUNTIME_WITNESS.deploymentEnvironment);
      assert.equal(publishedStatus.environment_url, TARGET);
      return response({ id: 88, ...publishedStatus }, 201);
    }

    throw new Error(`unexpected ${method} ${url}`);
  };

  const result = await publishChiefRuntimeWitness({
    env: env(),
    readFileFn: async () => JSON.stringify(runtimeReceipt()),
    observeInstallationFn: async () => {
      installationReads += 1;
      return installation();
    },
    getInstallationTokenFn: async () => 'token',
    fetchFn,
    writeArtifactFn: async (value) => { artifact = value; },
  });

  assert.equal(result.status, 'verified-published');
  assert.equal(result.authority.merge, false);
  assert.equal(result.authority.deploy, false);
  assert.equal(result.authority.rulesetMutation, false);
  assert.equal(result.check.issuerAppId, APP_ID);
  assert.equal(result.deployment.environment, 'proofmode-access-admin');
  assert.equal(artifact.receiptHash, publishedCheck.external_id);
  assert.equal(publishedDeployment.payload.receiptHash, publishedCheck.external_id);
  assert.match(publishedStatus.description, new RegExp(publishedCheck.external_id.slice(0, 12)));
  assert.equal(calls.filter((call) => call.method === 'POST').length, 3);
  assert.equal(calls.filter((call) => call.pathname.endsWith('/pulls/143')).length, 2);
  assert.equal(rulesetReads, 2);
  assert.equal(installationReads, 2);
});
