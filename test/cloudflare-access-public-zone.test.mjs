import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FCR_CLOUDFLARE_ACCOUNT_ID,
  FCR_PUBLIC_ZONE,
  matchingAccessReasons,
  reconcileFcrPublicAccessZone,
} from '../scripts/reconcile-cloudflare-access-public-zone.mjs';

const TOKEN = 'cf-test-token-123';

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

function fakeFetch({ organization, applications = [], onUpdate } = {}) {
  return async (url, options = {}) => {
    const method = options.method ?? 'GET';
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

const env = {
  CLOUDFLARE_ACCESS_ADMIN_API_TOKEN: TOKEN,
  CLOUDFLARE_ACCOUNT_ID: FCR_CLOUDFLARE_ACCOUNT_ID,
};

test('detects all-workers Access coverage as unsafe for automatic exemption', () => {
  assert.deepEqual(
    matchingAccessReasons({ destinations: [{ type: 'all_workers' }] }),
    ['all-workers'],
  );
});

test('dry run proposes only the FCR zone exemption', async () => {
  const receipt = await reconcileFcrPublicAccessZone({
    env,
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
});

test('apply preserves existing exemptions and adds only Founder Control Room', async () => {
  let updateBody = null;
  const receipt = await reconcileFcrPublicAccessZone({
    env,
    apply: true,
    fetchImpl: fakeFetch({
      organization: {
        deny_unmatched_requests: true,
        deny_unmatched_requests_exempted_zone_names: ['sekretbip.net'],
      },
      onUpdate(body) {
        updateBody = body;
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
});

test('refuses mutation when an explicit matching Access app exists', async () => {
  await assert.rejects(
    reconcileFcrPublicAccessZone({
      env,
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
    env,
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
