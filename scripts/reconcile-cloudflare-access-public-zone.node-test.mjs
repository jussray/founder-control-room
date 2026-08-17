import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FCR_CLOUDFLARE_ACCOUNT_ID,
  FCR_PUBLIC_ZONE,
  matchingAccessReasons,
  reconcileFcrPublicAccessZone,
} from './reconcile-cloudflare-access-public-zone.mjs';

const READ_TOKEN = 'cf-read-token-123';
const ADMIN_TOKEN = 'cf-admin-token-456';

function response(result, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return status >= 200 && status < 300
        ? { success: true, result }
        : { success: false, errors: [{ code: 10000, message: 'forbidden' }] };
    },
  };
}

function fakeFetch({ organization, applications = [], onUpdate, onRequest } = {}) {
  return async (url, options = {}) => {
    const method = options.method ?? 'GET';
    onRequest?.({ url, method, authorization: options.headers?.Authorization ?? null });
    if (url.endsWith('/access/organizations') && method === 'GET') {
      return response(organization);
    }
    if (url.includes('/access/apps?') && method === 'GET') {
      return response(applications);
    }
    if (url.endsWith('/access/organizations') && method === 'PUT') {
      const body = JSON.parse(options.body);
      onUpdate?.(body);
      return response({
        ...organization,
        deny_unmatched_requests_exempted_zone_names:
          body.deny_unmatched_requests_exempted_zone_names,
      });
    }
    throw new Error(`Unexpected request: ${method} ${url}`);
  };
}

const readEnv = {
  CLOUDFLARE_ACCESS_API_TOKEN: READ_TOKEN,
  CLOUDFLARE_ACCESS_ADMIN_API_TOKEN: ADMIN_TOKEN,
  CLOUDFLARE_ACCOUNT_ID: FCR_CLOUDFLARE_ACCOUNT_ID,
};

const adminEnv = {
  CLOUDFLARE_ACCESS_ADMIN_API_TOKEN: ADMIN_TOKEN,
  CLOUDFLARE_ACCOUNT_ID: FCR_CLOUDFLARE_ACCOUNT_ID,
};

test('detects all-workers Access coverage as unsafe for automatic exemption', () => {
  assert.deepEqual(
    matchingAccessReasons({ destinations: [{ type: 'all_workers' }] }),
    ['all-workers'],
  );
});

test('rejects noncanonical FCR account authority before any provider request', async () => {
  let requestCount = 0;
  const wrongAccountId = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

  await assert.rejects(
    reconcileFcrPublicAccessZone({
      env: {
        CLOUDFLARE_ACCESS_API_TOKEN: READ_TOKEN,
        CLOUDFLARE_ACCOUNT_ID: wrongAccountId,
      },
      apply: false,
      fetchImpl: async () => {
        requestCount += 1;
        throw new Error('provider fetch must not run on account mismatch');
      },
    }),
    (error) => {
      assert.equal(error?.classification, 'account-authority-mismatch');
      assert.equal(error?.expectedAccountId, FCR_CLOUDFLARE_ACCOUNT_ID);
      assert.equal(error?.suppliedAccountIdPresent, true);
      assert.match(String(error?.message), /account authority mismatch/i);
      return true;
    },
  );

  assert.equal(requestCount, 0);
});

test('read-only inspection uses only the dedicated least-privilege Access token', async () => {
  const requests = [];
  const receipt = await reconcileFcrPublicAccessZone({
    env: readEnv,
    apply: false,
    fetchImpl: fakeFetch({
      organization: {
        deny_unmatched_requests: false,
        deny_unmatched_requests_exempted_zone_names: [],
      },
      onRequest(request) {
        requests.push(request);
      },
    }),
  });

  assert.equal(receipt.credentialSource, 'CLOUDFLARE_ACCESS_API_TOKEN');
  assert.ok(requests.every((request) => request.authorization === `Bearer ${READ_TOKEN}`));
});

test('read-only inspection never falls back to the admin token', async () => {
  await assert.rejects(
    reconcileFcrPublicAccessZone({
      env: adminEnv,
      apply: false,
      fetchImpl: fakeFetch({
        organization: {
          deny_unmatched_requests: false,
          deny_unmatched_requests_exempted_zone_names: [],
        },
      }),
    }),
    /CLOUDFLARE_ACCESS_API_TOKEN is required for Access inspection/,
  );
});

test('read-only inspection never falls back to a generic Cloudflare token', async () => {
  await assert.rejects(
    reconcileFcrPublicAccessZone({
      env: {
        CLOUDFLARE_API_TOKEN: 'cf-generic-token-789',
        CLOUDFLARE_ACCOUNT_ID: FCR_CLOUDFLARE_ACCOUNT_ID,
      },
      apply: false,
      fetchImpl: fakeFetch({
        organization: {
          deny_unmatched_requests: false,
          deny_unmatched_requests_exempted_zone_names: [],
        },
      }),
    }),
    /CLOUDFLARE_ACCESS_API_TOKEN is required for Access inspection/,
  );
});

test('dry run proposes only the FCR zone exemption', async () => {
  const receipt = await reconcileFcrPublicAccessZone({
    env: readEnv,
    apply: false,
    fetchImpl: fakeFetch({
      organization: {
        deny_unmatched_requests: true,
        deny_unmatched_requests_exempted_zone_names: ['sekretbip.net'],
      },
    }),
  });

  assert.equal(receipt.zone, FCR_PUBLIC_ZONE);
  assert.equal(receipt.action, 'would-add-zone-exemption');
  assert.equal(receipt.mutationPerformed, false);
  assert.equal(receipt.state, 'attention');
});

test('apply requires the dedicated admin token and never falls back to read-only authority', async () => {
  await assert.rejects(
    reconcileFcrPublicAccessZone({
      env: {
        CLOUDFLARE_ACCESS_API_TOKEN: READ_TOKEN,
        CLOUDFLARE_ACCOUNT_ID: FCR_CLOUDFLARE_ACCOUNT_ID,
      },
      apply: true,
      fetchImpl: fakeFetch({
        organization: {
          deny_unmatched_requests: true,
          deny_unmatched_requests_exempted_zone_names: [],
        },
      }),
    }),
    /CLOUDFLARE_ACCESS_ADMIN_API_TOKEN is required for Access mutation/,
  );
});

test('apply preserves existing exemptions and adds only Founder Control Room', async () => {
  let updateBody = null;
  const requests = [];
  const receipt = await reconcileFcrPublicAccessZone({
    env: adminEnv,
    apply: true,
    fetchImpl: fakeFetch({
      organization: {
        deny_unmatched_requests: true,
        deny_unmatched_requests_exempted_zone_names: ['sekretbip.net'],
      },
      onUpdate(body) {
        updateBody = body;
      },
      onRequest(request) {
        requests.push(request);
      },
    }),
  });

  assert.deepEqual(updateBody, {
    deny_unmatched_requests_exempted_zone_names: [
      'foundercontrolroom.org',
      'sekretbip.net',
    ],
  });
  assert.equal(receipt.action, 'added-zone-exemption');
  assert.equal(receipt.mutationPerformed, true);
  assert.equal(receipt.credentialSource, 'CLOUDFLARE_ACCESS_ADMIN_API_TOKEN');
  assert.ok(requests.every((request) => request.authorization === `Bearer ${ADMIN_TOKEN}`));
});

test('refuses mutation when an explicit matching Access app exists', async () => {
  await assert.rejects(
    reconcileFcrPublicAccessZone({
      env: adminEnv,
      apply: true,
      fetchImpl: fakeFetch({
        organization: {
          deny_unmatched_requests: true,
          deny_unmatched_requests_exempted_zone_names: [],
        },
        applications: [
          {
            id: 'app-1',
            name: 'explicit-fcr-access',
            domain: 'foundercontrolroom.org',
          },
        ],
      }),
    }),
    /Explicit Cloudflare Access application coverage matches Founder Control Room/,
  );
});

test('already exempt is idempotent and does not update provider state', async () => {
  let updateCount = 0;
  const receipt = await reconcileFcrPublicAccessZone({
    env: adminEnv,
    apply: true,
    fetchImpl: fakeFetch({
      organization: {
        deny_unmatched_requests: true,
        deny_unmatched_requests_exempted_zone_names: ['foundercontrolroom.org'],
      },
      onUpdate() {
        updateCount += 1;
      },
    }),
  });

  assert.equal(receipt.action, 'already-exempt');
  assert.equal(updateCount, 0);
});

test('raw leading or trailing whitespace is rejected instead of silently trimmed', async () => {
  await assert.rejects(
    reconcileFcrPublicAccessZone({
      env: {
        CLOUDFLARE_ACCESS_API_TOKEN: ` ${READ_TOKEN} `,
        CLOUDFLARE_ACCOUNT_ID: FCR_CLOUDFLARE_ACCOUNT_ID,
      },
      apply: false,
      fetchImpl: fakeFetch({
        organization: {
          deny_unmatched_requests: false,
          deny_unmatched_requests_exempted_zone_names: [],
        },
      }),
    }),
    /dedicated Cloudflare Access read credential could not read/,
  );
});
