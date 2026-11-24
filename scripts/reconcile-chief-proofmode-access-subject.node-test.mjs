import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  createChiefAccessSubjectFingerprint,
  ensureChiefProofModeAccessPolicy,
  observeChiefAccessSubject,
} from './reconcile-chief-proofmode-access.mjs';

const TARGET = 'https://624e00c7-chief-ai.mcgill-raylene.workers.dev';
const HOST = '624e00c7-chief-ai.mcgill-raylene.workers.dev';
const APP_ID = 'app-exact';
const TOKEN_ID = 'token-a';
const CLIENT_ID = 'client-a.access';

function response(result) {
  return {
    ok: true,
    status: 200,
    async json() {
      return {
        success: true,
        result,
        errors: [],
        result_info: { page: 1, per_page: 100, total_pages: 1 },
      };
    },
  };
}

function fixture({ policies = [] } = {}) {
  return async (url) => {
    const path = new URL(url).pathname;
    if (path.endsWith('/access/apps')) {
      return response([{
        id: APP_ID,
        name: 'ProofMode exact immutable preview',
        destinations: [{ type: 'public', uri: `${HOST}/*` }],
      }]);
    }
    if (path.endsWith(`/access/apps/${APP_ID}/policies`)) return response(policies);
    if (path.endsWith('/access/service_tokens')) {
      return response([{ id: TOKEN_ID, client_id: CLIENT_ID, enabled: true }]);
    }
    throw new Error(`Unexpected fixture request: ${path}`);
  };
}

const expectedSubject = createChiefAccessSubjectFingerprint({
  targetOrigin: TARGET,
  applicationId: APP_ID,
  serviceTokenId: TOKEN_ID,
});

test('configured provider evidence is bound to target + application + service-token identity', async () => {
  const result = await ensureChiefProofModeAccessPolicy({
    fetchImpl: fixture({
      policies: [{
        id: 'policy-a',
        decision: 'non_identity',
        include: [{ service_token: { token_id: TOKEN_ID } }],
      }],
    }),
    mode: 'check',
    accountId: 'account-1',
    apiToken: 'read-token',
    targetUrl: TARGET,
    serviceClientId: CLIENT_ID,
  });

  assert.equal(result.subjectFingerprint, expectedSubject);
  assert.match(result.subjectFingerprint, /^sha256:[0-9a-f]{64}$/);
});

test('missing-policy blocked evidence preserves the exact resolvable provider subject', async () => {
  await assert.rejects(
    ensureChiefProofModeAccessPolicy({
      fetchImpl: fixture(),
      mode: 'check',
      accountId: 'account-1',
      apiToken: 'read-token',
      targetUrl: TARGET,
      serviceClientId: CLIENT_ID,
    }),
    (error) => {
      assert.match(error.message, /No matching Chief Service Auth policy exists/);
      assert.equal(error.chiefAccessSubjectFingerprint, expectedSubject);
      return true;
    },
  );
});

test('different provider identities cannot share a reconciliation subject fingerprint', () => {
  const appChanged = createChiefAccessSubjectFingerprint({
    targetOrigin: TARGET,
    applicationId: 'app-b',
    serviceTokenId: TOKEN_ID,
  });
  const tokenChanged = createChiefAccessSubjectFingerprint({
    targetOrigin: TARGET,
    applicationId: APP_ID,
    serviceTokenId: 'token-b',
  });

  assert.notEqual(appChanged, expectedSubject);
  assert.notEqual(tokenChanged, expectedSubject);
  assert.notEqual(appChanged, tokenChanged);
});


test('read-only subject observation distinguishes configured from merely resolvable identity', async () => {
  const configured = await observeChiefAccessSubject({
    fetchImpl: fixture({
      policies: [{
        id: 'policy-a',
        decision: 'non_identity',
        include: [{ service_token: { token_id: TOKEN_ID } }],
      }],
    }),
    accountId: 'account-1',
    apiToken: 'read-token',
    targetUrl: TARGET,
    serviceClientId: CLIENT_ID,
  });
  assert.deepEqual(configured, { subjectFingerprint: expectedSubject, configured: true, reasonCode: null });

  const missingPolicy = await observeChiefAccessSubject({
    fetchImpl: fixture(),
    accountId: 'account-1',
    apiToken: 'read-token',
    targetUrl: TARGET,
    serviceClientId: CLIENT_ID,
  });
  assert.deepEqual(missingPolicy, {
    subjectFingerprint: expectedSubject,
    configured: false,
    reasonCode: 'service-auth-policy-missing',
  });
});

function countingFixture({ policies = [] } = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const path = new URL(url).pathname;
    calls.push({ path, method: init.method || 'GET' });
    if (path.endsWith('/access/apps')) {
      return response([{
        id: APP_ID,
        name: 'ProofMode exact immutable preview',
        destinations: [{ type: 'public', uri: `${HOST}/*` }],
      }]);
    }
    if (path.endsWith(`/access/apps/${APP_ID}/policies`)) {
      if (init.method === 'POST') {
        return response({
          id: 'policy-new',
          decision: 'non_identity',
          include: [{ service_token: { token_id: TOKEN_ID } }],
        });
      }
      return response(policies);
    }
    if (path.endsWith('/access/service_tokens')) {
      return response([{ id: TOKEN_ID, client_id: CLIENT_ID, enabled: true }]);
    }
    throw new Error(`Unexpected fixture request: ${path}`);
  };
  return { fetchImpl, calls };
}

const repairArgs = {
  mode: 'repair',
  accountId: 'account-1',
  apiToken: 'admin-token',
  targetUrl: TARGET,
  serviceClientId: CLIENT_ID,
};

test('latch-bound apply refuses a subject that changed after observation, before any provider write', async () => {
  const { fetchImpl, calls } = countingFixture();
  const latchedForOtherApp = createChiefAccessSubjectFingerprint({
    targetOrigin: TARGET,
    applicationId: 'app-changed-after-latch',
    serviceTokenId: TOKEN_ID,
  });

  await assert.rejects(
    ensureChiefProofModeAccessPolicy({
      ...repairArgs,
      fetchImpl,
      expectedSubjectFingerprint: latchedForOtherApp,
    }),
    (error) => {
      assert.match(error.message, /differs from the latched repair subject/);
      assert.equal(error.chiefAccessMutationOutcome, undefined);
      return true;
    },
  );
  assert.equal(calls.filter(({ method }) => method === 'POST').length, 0);
});

test('latch-bound apply proceeds when the resolved subject still equals the latched subject', async () => {
  const { fetchImpl, calls } = countingFixture();

  const result = await ensureChiefProofModeAccessPolicy({
    ...repairArgs,
    fetchImpl,
    expectedSubjectFingerprint: expectedSubject,
  });

  assert.equal(result.changed, true);
  assert.equal(result.subjectFingerprint, expectedSubject);
  assert.equal(calls.filter(({ method }) => method === 'POST').length, 1);
});

test('mutation stage record flips to attempted only at the provider write', async () => {
  const attemptedDir = mkdtempSync(join(tmpdir(), 'chief-access-stage-'));
  const attemptedPath = join(attemptedDir, 'stage.txt');
  writeFileSync(attemptedPath, 'not-attempted\n', 'utf8');
  const attempted = countingFixture();
  await ensureChiefProofModeAccessPolicy({
    ...repairArgs,
    fetchImpl: attempted.fetchImpl,
    expectedSubjectFingerprint: expectedSubject,
    mutationStagePath: attemptedPath,
  });
  assert.equal(readFileSync(attemptedPath, 'utf8'), 'attempted\n');

  const blockedDir = mkdtempSync(join(tmpdir(), 'chief-access-stage-'));
  const blockedPath = join(blockedDir, 'stage.txt');
  writeFileSync(blockedPath, 'not-attempted\n', 'utf8');
  const blocked = countingFixture({
    policies: [{
      id: 'policy-wrong',
      name: 'ProofMode CI service auth',
      decision: 'allow',
      include: [{ everyone: {} }],
    }],
  });
  await assert.rejects(
    ensureChiefProofModeAccessPolicy({
      ...repairArgs,
      fetchImpl: blocked.fetchImpl,
      expectedSubjectFingerprint: expectedSubject,
      mutationStagePath: blockedPath,
    }),
    /refusing automatic overwrite/,
  );
  assert.equal(readFileSync(blockedPath, 'utf8'), 'not-attempted\n');
  assert.equal(blocked.calls.filter(({ method }) => method === 'POST').length, 0);

  const swappedDir = mkdtempSync(join(tmpdir(), 'chief-access-stage-'));
  const swappedPath = join(swappedDir, 'stage.txt');
  writeFileSync(swappedPath, 'not-attempted\n', 'utf8');
  const swapped = countingFixture();
  await assert.rejects(
    ensureChiefProofModeAccessPolicy({
      ...repairArgs,
      fetchImpl: swapped.fetchImpl,
      expectedSubjectFingerprint: createChiefAccessSubjectFingerprint({
        targetOrigin: TARGET,
        applicationId: 'app-changed-after-latch',
        serviceTokenId: TOKEN_ID,
      }),
      mutationStagePath: swappedPath,
    }),
    /differs from the latched repair subject/,
  );
  assert.equal(readFileSync(swappedPath, 'utf8'), 'not-attempted\n');
  assert.equal(swapped.calls.filter(({ method }) => method === 'POST').length, 0);
});
