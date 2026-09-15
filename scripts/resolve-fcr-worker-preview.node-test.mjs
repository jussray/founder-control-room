import assert from 'node:assert/strict';
import test from 'node:test';

import {
  extractImmutablePreviewOrigin,
  findExactSuccessfulBuild,
  readBuildLogsBounded,
  resolveExactFcrPreview,
} from './resolve-fcr-worker-preview.mjs';

const SHA = '0123456789abcdef0123456789abcdef01234567';
const BRANCH = 'fix/relay-v3-exact-base-successor-20260913';

function build({
  uuid,
  sha = SHA,
  branch = BRANCH,
  outcome = 'success',
}) {
  return {
    build_uuid: uuid,
    build_outcome: outcome,
    build_trigger_metadata: {
      commit_hash: sha,
      branch,
    },
  };
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('findExactSuccessfulBuild binds outcome, branch, and exact commit hash', () => {
  const exact = build({ uuid: '11111111-1111-4111-8111-111111111111' });
  const result = findExactSuccessfulBuild([
    build({ uuid: '22222222-2222-4222-8222-222222222222', outcome: 'fail' }),
    build({ uuid: '33333333-3333-4333-8333-333333333333', branch: 'main' }),
    build({ uuid: '44444444-4444-4444-8444-444444444444', sha: 'f'.repeat(40) }),
    exact,
  ], SHA, BRANCH);

  assert.equal(result.build_uuid, exact.build_uuid);
});

test('findExactSuccessfulBuild fails closed on duplicate exact build identity', () => {
  assert.throws(
    () => findExactSuccessfulBuild([
      build({ uuid: '11111111-1111-4111-8111-111111111111' }),
      build({ uuid: '22222222-2222-4222-8222-222222222222' }),
    ], SHA, BRANCH),
    /FCR_PREVIEW_BUILD_AMBIGUOUS/,
  );
});

test('extractImmutablePreviewOrigin accepts only one 8-hex immutable Worker preview', () => {
  const origin = extractImmutablePreviewOrigin({
    lines: [
      [1, 'Uploaded founder-control-room'],
      [2, 'Version Preview URL: https://a1b2c3d4-founder-control-room.example-subdomain.workers.dev'],
      [3, 'Repeat https://a1b2c3d4-founder-control-room.example-subdomain.workers.dev/'],
      [4, 'Branch alias https://feature-founder-control-room.example-subdomain.workers.dev'],
    ],
  });

  assert.equal(origin, 'https://a1b2c3d4-founder-control-room.example-subdomain.workers.dev');
});

test('extractImmutablePreviewOrigin fails closed when multiple immutable previews appear', () => {
  assert.throws(
    () => extractImmutablePreviewOrigin({
      lines: [[1, 'https://a1b2c3d4-founder-control-room.example.workers.dev https://deadbeef-founder-control-room.example.workers.dev']],
    }),
    /FCR_PREVIEW_URL_AMBIGUOUS/,
  );
});

test('readBuildLogsBounded follows Cloudflare log cursors', async () => {
  const seen = [];
  const fetchImpl = async (url) => {
    seen.push(url);
    if (url.includes('?cursor=next-page')) {
      return jsonResponse({ success: true, result: { truncated: false, lines: [[2, 'second']] } });
    }
    return jsonResponse({
      success: true,
      result: { truncated: true, cursor: 'next-page', lines: [[1, 'first']] },
    });
  };

  const result = await readBuildLogsBounded(
    fetchImpl,
    'token',
    'account',
    '11111111-1111-4111-8111-111111111111',
  );

  assert.deepEqual(result.lines, [[1, 'first'], [2, 'second']]);
  assert.equal(seen.length, 2);
  assert.match(seen[1], /cursor=next-page/);
});

test('resolveExactFcrPreview traverses build pages and exact build logs without mutation', async () => {
  const exactUuid = '11111111-1111-4111-8111-111111111111';
  const calls = [];
  const fetchImpl = async (raw, init = {}) => {
    const url = new URL(raw);
    calls.push({ url: url.href, method: init.method || 'GET', authorization: init.headers?.Authorization });

    if (url.pathname.endsWith('/workers/scripts')) {
      return jsonResponse({ success: true, result: [{ id: 'founder-control-room', tag: 'worker-tag-1' }] });
    }
    if (url.pathname.endsWith('/builds/workers/worker-tag-1/builds')) {
      if (url.searchParams.get('page') === '1') {
        return jsonResponse({
          success: true,
          result: [build({ uuid: '22222222-2222-4222-8222-222222222222', branch: 'main' })],
          result_info: { page: 1, per_page: 200, total_pages: 2 },
        });
      }
      return jsonResponse({
        success: true,
        result: [build({ uuid: exactUuid })],
        result_info: { page: 2, per_page: 200, total_pages: 2 },
      });
    }
    if (url.pathname.endsWith(`/builds/builds/${exactUuid}/logs`)) {
      if (!url.searchParams.has('cursor')) {
        return jsonResponse({
          success: true,
          result: { truncated: true, cursor: 'logs-2', lines: [[1, 'uploading version']] },
        });
      }
      return jsonResponse({
        success: true,
        result: {
          truncated: false,
          lines: [[2, 'Version Preview URL: https://a1b2c3d4-founder-control-room.example-subdomain.workers.dev']],
        },
      });
    }
    return jsonResponse({ success: false, errors: [{ code: 12000 }] }, 404);
  };

  const result = await resolveExactFcrPreview({
    fetchImpl,
    accountId: 'account',
    apiToken: 'read-token',
    expectedSha: SHA,
    expectedBranch: BRANCH,
  });

  assert.equal(result.previewOrigin, 'https://a1b2c3d4-founder-control-room.example-subdomain.workers.dev');
  assert.equal(result.buildUuid, exactUuid);
  assert.equal(result.providerMutationAuthorized, false);
  assert.equal(result.mergeAuthorized, false);
  assert.ok(calls.every((call) => call.method === 'GET'));
  assert.ok(calls.every((call) => call.authorization === 'Bearer read-token'));
});
