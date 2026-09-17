import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createChiefAccessSubjectFingerprint,
  ensureChiefProofModeAccessPolicy,
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
