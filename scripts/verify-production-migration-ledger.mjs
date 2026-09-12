#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { classifyMainReleaseProvenance } from './verify-main-release-provenance.mjs';

const VERSION_PATTERN = /^\d{14}$/;
const FULL_SHA = /^[0-9a-f]{40}$/;
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const GITHUB_API_BASE = 'https://api.github.com';
export const CONSTITUTIONAL_REQUIRED_MIGRATIONS = Object.freeze([
  '20260809072500',
]);

export function parseLocalVersion(fileName) {
  const match = /^(\d{14})_.+\.sql$/.exec(fileName);
  return match?.[1] ?? null;
}

export function parseRemoteVersions(text) {
  const versions = new Set();

  for (const line of String(text).split(/\r?\n/)) {
    const columns = line.split(/[│|]/).map((value) => value.trim());
    const remoteVersion = columns[1] ?? '';
    if (VERSION_PATTERN.test(remoteVersion)) versions.add(remoteVersion);
  }

  return [...versions].sort();
}

export function requiredMigrationVersions(configuredVersions = []) {
  return [...new Set([
    ...configuredVersions,
    ...CONSTITUTIONAL_REQUIRED_MIGRATIONS,
  ])].sort();
}

export function buildReceipt({
  phase,
  localVersions,
  remoteVersions,
  requiredVersions,
  remoteListSource,
}) {
  const localSet = new Set(localVersions);
  const remoteSet = new Set(remoteVersions);

  return {
    phase,
    generatedAt: new Date().toISOString(),
    localMigrationCount: localVersions.length,
    remoteMigrationCount: remoteVersions.length,
    localOnly: localVersions.filter((version) => !remoteSet.has(version)),
    remoteOnly: remoteVersions.filter((version) => !localSet.has(version)),
    requiredVersions,
    missingRequiredLocal: requiredVersions.filter((version) => !localSet.has(version)),
    missingRequiredRemote: requiredVersions.filter((version) => !remoteSet.has(version)),
    remoteListSource,
  };
}

export function shouldEnforceMainReleaseProvenance({
  phase,
  githubActions = process.env.GITHUB_ACTIONS,
  githubWorkflow = process.env.GITHUB_WORKFLOW,
  githubEventName = process.env.GITHUB_EVENT_NAME,
} = {}) {
  return phase === 'preflight'
    && githubActions === 'true'
    && githubWorkflow === 'Deploy'
    && githubEventName === 'workflow_dispatch';
}

async function fetchGithubJson(fetchImpl, url, token) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('GitHub provider observation requires fetch support');
  }

  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'founder-control-room-production-provenance-gate',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetchImpl(url, { headers });
  if (!response?.ok) {
    throw new Error(`GitHub provider observation failed with HTTP ${response?.status ?? 'unknown'}`);
  }
  return response.json();
}

export async function observeMainReleaseProvenance({
  repository,
  targetSha,
  fetchImpl = globalThis.fetch,
  token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '',
} = {}) {
  const repo = String(repository || '').trim();
  const target = String(targetSha || '').trim().toLowerCase();

  if (!REPOSITORY_PATTERN.test(repo)) {
    return { ok: false, reason: 'invalid_repository', targetSha: target || null };
  }
  if (!FULL_SHA.test(target)) {
    return { ok: false, reason: 'invalid_sha', targetSha: target || null };
  }

  try {
    const [mainBranch, associatedPulls] = await Promise.all([
      fetchGithubJson(fetchImpl, `${GITHUB_API_BASE}/repos/${repo}/branches/main`, token),
      fetchGithubJson(fetchImpl, `${GITHUB_API_BASE}/repos/${repo}/commits/${target}/pulls`, token),
    ]);

    const result = classifyMainReleaseProvenance({
      targetSha: target,
      currentMainSha: mainBranch?.commit?.sha,
      associatedPulls,
    });

    return {
      ...result,
      repository: repo,
      provider: 'github',
    };
  } catch (error) {
    return {
      ok: false,
      reason: 'provider_unavailable',
      targetSha: target,
      repository: repo,
      provider: 'github',
      detail: error instanceof Error ? error.message.slice(0, 200) : 'unknown provider failure',
    };
  }
}

function checkedOutHeadSha() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim().toLowerCase();
  } catch {
    return '';
  }
}

export async function main() {
  const migrationsDir = resolve(process.cwd(), 'supabase/migrations');
  const remoteListPath = process.env.REMOTE_MIGRATION_LIST_PATH
    ? resolve(process.cwd(), process.env.REMOTE_MIGRATION_LIST_PATH)
    : null;
  const receiptPath = process.env.MIGRATION_LEDGER_RECEIPT_PATH
    ? resolve(process.cwd(), process.env.MIGRATION_LEDGER_RECEIPT_PATH)
    : resolve(process.cwd(), 'test-results/production-migration-ledger.json');
  const phase = process.env.MIGRATION_LEDGER_PHASE || 'preflight';
  const configuredRequiredVersions = String(process.env.REQUIRED_MIGRATION_VERSIONS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (!remoteListPath) {
    throw new Error('REMOTE_MIGRATION_LIST_PATH is required');
  }
  if (!['preflight', 'post-push'].includes(phase)) {
    throw new Error('MIGRATION_LEDGER_PHASE must be preflight or post-push');
  }
  if (configuredRequiredVersions.some((version) => !VERSION_PATTERN.test(version))) {
    throw new Error('REQUIRED_MIGRATION_VERSIONS must contain comma-separated 14-digit versions');
  }

  let releaseProvenance = null;
  if (shouldEnforceMainReleaseProvenance({ phase })) {
    releaseProvenance = await observeMainReleaseProvenance({
      repository: process.env.GITHUB_REPOSITORY,
      targetSha: checkedOutHeadSha(),
    });
  }

  const requiredVersions = requiredMigrationVersions(configuredRequiredVersions);
  const localFiles = (await readdir(migrationsDir))
    .filter((name) => name.endsWith('.sql'))
    .sort();
  const localVersions = localFiles.map(parseLocalVersion).filter(Boolean);
  const remoteText = await readFile(remoteListPath, 'utf8');
  const remoteVersions = parseRemoteVersions(remoteText);
  const receipt = {
    ...buildReceipt({
      phase,
      localVersions,
      remoteVersions,
      requiredVersions,
      remoteListSource: basename(remoteListPath),
    }),
    ...(releaseProvenance ? { releaseProvenance } : {}),
  };

  await mkdir(dirname(receiptPath), { recursive: true });
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(receipt, null, 2));

  const failures = [];
  if (releaseProvenance && !releaseProvenance.ok) {
    failures.push(`main release provenance blocked: ${releaseProvenance.reason}`);
  }
  if (receipt.missingRequiredLocal.length > 0) {
    failures.push(`required migrations absent locally: ${receipt.missingRequiredLocal.join(', ')}`);
  }
  if (receipt.remoteOnly.length > 0) {
    failures.push(`remote migrations absent locally: ${receipt.remoteOnly.join(', ')}`);
  }
  if (phase === 'post-push' && receipt.localOnly.length > 0) {
    failures.push(`local migrations absent remotely after push: ${receipt.localOnly.join(', ')}`);
  }
  if (phase === 'post-push' && receipt.missingRequiredRemote.length > 0) {
    failures.push(`required migrations absent remotely after push: ${receipt.missingRequiredRemote.join(', ')}`);
  }

  if (failures.length > 0) {
    for (const failure of failures) console.error(failure);
    process.exitCode = 1;
  } else {
    console.log(`Migration ledger verification passed for ${phase}.`);
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  await main();
}
