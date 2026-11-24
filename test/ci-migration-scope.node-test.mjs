import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { classifyMigrationScope } from '../scripts/ci-migration-scope.mjs';

const run = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

test('rejects missing and stale exact SHA evidence instead of silently skipping database lint', () => {
  const base = 'a'.repeat(40), head = 'b'.repeat(40);
  assert.throws(() => classifyMigrationScope({ baseSha: 'x', headSha: head }), /full nonzero exact/u);
  assert.throws(() => classifyMigrationScope({ baseSha: base, headSha: head, git: () => { throw new Error('not ancestor'); } }), /not an ancestor/u);
  assert.throws(() => classifyMigrationScope({ baseSha: base, headSha: head, git: (args) => args[0] === 'diff' ? null : '' }), /diff unavailable/u);
});

test('checks an actual local git range and only requires local DB when Supabase schema moved', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'fcr-migration-scope-'));
  try {
    run(cwd, 'init', '-q');
    run(cwd, 'config', 'user.name', 'CI Proof');
    run(cwd, 'config', 'user.email', 'ci-proof@example.invalid');
    fs.writeFileSync(path.join(cwd, 'README.md'), 'baseline\n');
    run(cwd, 'add', '.');
    run(cwd, 'commit', '-qm', 'base');
    const base = run(cwd, 'rev-parse', 'HEAD');
    fs.appendFileSync(path.join(cwd, 'README.md'), 'docs only\n');
    run(cwd, 'add', '.');
    run(cwd, 'commit', '-qm', 'docs only');
    const docs = run(cwd, 'rev-parse', 'HEAD');
    assert.equal(classifyMigrationScope({ baseSha: base, headSha: docs, cwd }).execute, false);

    const folder = path.join(cwd, 'supabase', 'migrations');
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, '20261103_a.sql'), 'select 1;\n');
    run(cwd, 'add', '.');
    run(cwd, 'commit', '-qm', 'schema change');
    const migration = run(cwd, 'rev-parse', 'HEAD');
    const scoped = classifyMigrationScope({ baseSha: docs, headSha: migration, cwd });
    assert.equal(scoped.execute, true);
    assert.deepEqual(scoped.schemaFiles, ['supabase/migrations/20261103_a.sql']);
    assert.throws(() => classifyMigrationScope({ baseSha: migration, headSha: docs, cwd }), /not an ancestor/u);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});
