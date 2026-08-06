#!/usr/bin/env node

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

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

function parseLocalVersion(fileName) {
  const match = /^(\d{14})_.+\.sql$/.exec(fileName);
  return match?.[1] ?? null;
}

function parseRemoteVersions(text) {
  const versions = new Set();
  for (const line of text.split(/\r?\n/)) {
    const columns = line
      .split('│')
      .map((value) => value.trim())
      .filter(Boolean);
    for (const value of columns.slice(0, 2)) {
      if (/^\d{14}$/.test(value)) versions.add(value);
    }
  }
  return [...versions].sort();
}

const localFiles = (await readdir(migrationsDir))
  .filter((name) => name.endsWith('.sql'))
  .sort();
const localVersions = localFiles.map(parseLocalVersion).filter(Boolean);

if (!remoteListPath) {
  throw new Error('REMOTE_MIGRATION_LIST_PATH is required');
}

const remoteText = await readFile(remoteListPath, 'utf8');
const remoteVersions = parseRemoteVersions(remoteText);
const localSet = new Set(localVersions);
const remoteSet = new Set(remoteVersions);
const localOnly = localVersions.filter((version) => !remoteSet.has(version));
const remoteOnly = remoteVersions.filter((version) => !localSet.has(version));
const missingRequiredRemote = requiredVersions.filter((version) => !remoteSet.has(version));
const missingRequiredLocal = requiredVersions.filter((version) => !localSet.has(version));

const receipt = {
  phase,
  generatedAt: new Date().toISOString(),
  localMigrationCount: localVersions.length,
  remoteMigrationCount: remoteVersions.length,
  localOnly,
  remoteOnly,
  requiredVersions,
  missingRequiredLocal,
  missingRequiredRemote,
  remoteListSource: basename(remoteListPath),
};

await mkdir(resolve(receiptPath, '..'), { recursive: true });
await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');

console.log(JSON.stringify(receipt, null, 2));

if (missingRequiredLocal.length > 0) {
  console.error(`Required migrations are absent from the checked-out repository: ${missingRequiredLocal.join(', ')}`);
  process.exitCode = 1;
} else if (phase === 'post-push' && missingRequiredRemote.length > 0) {
  console.error(`Required migrations remain absent from the remote ledger after push: ${missingRequiredRemote.join(', ')}`);
  process.exitCode = 1;
} else if (remoteOnly.length > 0) {
  console.error(`Remote migration versions are absent from the checked-out repository: ${remoteOnly.join(', ')}`);
  process.exitCode = 1;
} else {
  console.log(`Migration ledger verification passed for ${phase}.`);
}
