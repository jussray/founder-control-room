#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';

const API = 'https://api.cloudflare.com/client/v4';
const SHA40 = /^[0-9a-f]{40}$/;

function required(value, name) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) throw new Error(`${name} is required.`);
  return normalized;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function normalizeBuilds(result) {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.builds)) return result.builds;
  return [];
}

export function findExactSuccessfulBuild(builds, expectedSha, expectedBranch) {
  const sha = required(expectedSha, 'expected SHA').toLowerCase();
  const branch = required(expectedBranch, 'expected branch');
  if (!SHA40.test(sha)) throw new Error('expected SHA must be a lowercase 40-character commit SHA.');

  const matches = normalizeBuilds(builds).filter((build) => {
    const metadata = build?.build_trigger_metadata || {};
    return build?.build_outcome === 'success'
      && String(metadata.commit_hash || '').trim().toLowerCase() === sha
      && String(metadata.branch || '').trim() === branch;
  });

  if (matches.length === 0) {
    throw new Error(`FCR_PREVIEW_BUILD_NOT_FOUND: no successful Cloudflare Worker build matched ${branch}@${sha}.`);
  }
  if (matches.length !== 1) {
    throw new Error(`FCR_PREVIEW_BUILD_AMBIGUOUS: expected one successful Cloudflare Worker build for ${branch}@${sha}, found ${matches.length}.`);
  }

  const buildUuid = required(matches[0]?.build_uuid, 'exact Cloudflare build UUID');
  return { ...matches[0], build_uuid: buildUuid };
}

export function extractImmutablePreviewOrigin(logResult, workerName = 'founder-control-room') {
  const lines = Array.isArray(logResult?.lines) ? logResult.lines : [];
  const text = lines
    .flatMap((line) => (Array.isArray(line) ? line : [line]))
    .map((value) => String(value ?? ''))
    .join('\n');
  const escapedWorker = escapeRegExp(required(workerName, 'worker name'));
  const pattern = new RegExp(
    `https://[0-9a-f]{8}-${escapedWorker}\\.[a-z0-9-]+\\.workers\\.dev(?:/)?`,
    'gi',
  );
  const origins = [...new Set(
    [...text.matchAll(pattern)].map((match) => new URL(match[0]).origin.toLowerCase()),
  )];

  if (origins.length === 0) {
    throw new Error('FCR_PREVIEW_URL_NOT_FOUND: exact Cloudflare build logs did not contain an immutable founder-control-room Workers preview URL.');
  }
  if (origins.length !== 1) {
    throw new Error(`FCR_PREVIEW_URL_AMBIGUOUS: exact Cloudflare build logs exposed ${origins.length} immutable founder-control-room preview origins.`);
  }
  return origins[0];
}

async function cloudflareJson(fetchImpl, apiToken, path) {
  const response = await fetchImpl(`${API}${path}`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${apiToken}` },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success !== true) {
    const code = payload?.errors?.[0]?.code;
    throw new Error(`Cloudflare read failed with HTTP ${response.status}${code ? ` (code ${code})` : ''}.`);
  }
  return payload.result;
}

export async function resolveExactFcrPreview({
  fetchImpl = globalThis.fetch,
  accountId,
  apiToken,
  expectedSha,
  expectedBranch,
  workerName = 'founder-control-room',
}) {
  if (typeof fetchImpl !== 'function') throw new Error('A fetch implementation is required.');
  const account = required(accountId, 'Cloudflare account ID');
  const token = required(apiToken, 'FCR Cloudflare Builds read token');
  const worker = required(workerName, 'worker name');
  const sha = required(expectedSha, 'expected SHA').toLowerCase();
  const branch = required(expectedBranch, 'expected branch');
  if (!SHA40.test(sha)) throw new Error('expected SHA must be a lowercase 40-character commit SHA.');

  const scripts = await cloudflareJson(fetchImpl, token, `/accounts/${encodeURIComponent(account)}/workers/scripts`);
  const matchedWorkers = (Array.isArray(scripts) ? scripts : []).filter((entry) => entry?.id === worker && entry?.tag);
  if (matchedWorkers.length !== 1) {
    throw new Error(`FCR_WORKER_IDENTITY_AMBIGUOUS: expected one Worker named ${worker}, found ${matchedWorkers.length}.`);
  }

  const workerTag = matchedWorkers[0].tag;
  const builds = await cloudflareJson(
    fetchImpl,
    token,
    `/accounts/${encodeURIComponent(account)}/builds/workers/${encodeURIComponent(workerTag)}/builds`,
  );
  const build = findExactSuccessfulBuild(builds, sha, branch);
  const logs = await cloudflareJson(
    fetchImpl,
    token,
    `/accounts/${encodeURIComponent(account)}/builds/builds/${encodeURIComponent(build.build_uuid)}/logs`,
  );
  const previewOrigin = extractImmutablePreviewOrigin(logs, worker);

  return {
    schema: 'fcr/cloudflare-worker-preview-resolution@v1',
    workerName: worker,
    expectedSha: sha,
    expectedBranch: branch,
    buildUuid: build.build_uuid,
    previewOrigin,
    providerMutationAuthorized: false,
    mergeAuthorized: false,
  };
}

async function main() {
  const result = await resolveExactFcrPreview({
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    apiToken: process.env.FCR_CLOUDFLARE_BUILDS_USER_TOKEN,
    expectedSha: process.env.FCR_FEDERATED_RELAY_SOURCE_SHA,
    expectedBranch: process.env.FCR_FEDERATED_RELAY_SOURCE_BRANCH,
    workerName: process.env.FCR_CLOUDFLARE_WORKER_NAME || 'founder-control-room',
  });

  await mkdir('test-results', { recursive: true });
  await writeFile(
    'test-results/fcr-worker-preview-resolution.json',
    `${JSON.stringify({ ...result, resolvedAt: new Date().toISOString() }, null, 2)}\n`,
    'utf8',
  );

  if (process.env.GITHUB_ENV) {
    await writeFile(process.env.GITHUB_ENV, `FCR_FEDERATED_RELAY_BASE_URL=${result.previewOrigin}\n`, { flag: 'a' });
  } else {
    process.stdout.write(`${result.previewOrigin}\n`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
