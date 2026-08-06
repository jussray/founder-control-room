#!/usr/bin/env node

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const VERSION_PATTERN = /^\d{14}$/;

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

export async function main() {
  const migrationsDir = resolve(process.cwd(), 'supabase/migrations');
  const remoteListPath = process.env.REMOTE_MIGRATION_LIST_PATH
    ? resolve(process.cwd(), process.env.REMOTE_MIGRATION_LIST_PATH)
    : null;
  const receiptPath = process.env.MIGRATION_LEDGER_RECEIPT_PATH
    ? resolve(process.cwd(), process.env.MIGRATION_LEDGER_RECEIPT_PATH)
    : resolve(process.cwd(), 'test-results/production-migration-ledger.json');
  const phase = process.env.MIGRATION_LEDGER_PHASE || 'preflight';
  const requiredVersions = String(process.env.REQUIRED_MIGRATION_VERSIONS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (!remoteListPath) {
    throw new Error('REMOTE_MIGRATION_LIST_PATH is required');
  }
  if (!['preflight', 'post-push'].includes(phase)) {
    throw new Error('MIGRATION_LEDGER_PHASE must be preflight or post-push');
  }
  if (requiredVersions.some((version) => !VERSION_PATTERN.test(version))) {
    throw new Error('REQUIRED_MIGRATION_VERSIONS must contain comma-separated 14-digit versions');
  }

  const localFiles = (await readdir(migrationsDir))
    .filter((name) => name.endsWith('.sql'))
    .sort();
  const localVersions = localFiles.map(parseLocalVersion).filter(Boolean);
  const remoteText = await readFile(remoteListPath, 'utf8');
  const remoteVersions = parseRemoteVersions(remoteText);
  const receipt = buildReceipt({
    phase,
    localVersions,
    remoteVersions,
    requiredVersions,
    remoteListSource: basename(remoteListPath),
  });

  await mkdir(dirname(receiptPath), { recursive: true });
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(receipt, null, 2));

  const failures = [];
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
