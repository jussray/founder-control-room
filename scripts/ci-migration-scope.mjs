import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// An exact-head SQL change must never be pronounced validated by a missing
// database. This helper classifies the whole base->head range and fails closed.
export function classifyMigrationScope({
  baseSha, headSha, cwd = process.cwd(),
  git = (args) => execFileSync('git', args, { cwd, encoding: 'utf8' }),
}) {
  const exact = (value) => typeof value === 'string' && /^[0-9a-f]{40}$/i.test(value) && !/^0+$/.test(value);
  if (!exact(baseSha) || !exact(headSha)) {
    throw new Error('Migration scope requires full nonzero exact base and head SHAs.');
  }
  try {
    git(['merge-base', '--is-ancestor', baseSha, headSha]);
  } catch {
    throw new Error('Migration scope live base is not an ancestor of exact candidate head.');
  }
  const output = git(['diff', '--name-only', '--no-ext-diff', `${baseSha}..${headSha}`, '--']);
  if (typeof output !== 'string') throw new Error('Migration scope git diff unavailable.');
  const allFiles = output.split(/\r?\n/u).map((v) => v.trim()).filter(Boolean);
  const schemaFiles = allFiles.filter((file) =>
    file.startsWith('supabase/')
    || file === 'config/rls-known-gaps.json');
  return { execute: schemaFiles.length > 0, schemaFiles, changedFileCount: allFiles.length };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    const result = classifyMigrationScope({
      baseSha: process.env.MIGRATION_BASE_SHA,
      headSha: process.env.EXPECTED_HEAD_SHA,
    });
    if (!process.env.GITHUB_OUTPUT) throw new Error('GITHUB_OUTPUT is required to bind migration scope to this run.');
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `execute=${result.execute}\n`, 'utf8');
    console.log(JSON.stringify({ ...result, evidenceScope: 'git-exact-base-to-head' }));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
