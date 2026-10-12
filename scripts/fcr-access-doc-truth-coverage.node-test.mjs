import assert from 'node:assert/strict';
import { appendFileSync, copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

// Regression coverage: the Access split and reconcile scripts are cloudflare-authority
// changes for Documentation Truth. The verifier reads ~25 repository documents before it
// reports failures, so the fixture is the repository's own committed tree, extracted once.
// Each case commits one probe to a detached head on top of that base and runs the real
// verifier against base..probe. No network, no provider, no Cloudflare call.
// Requires the committed tree to contain the verifier; it reads HEAD, not the working copy.

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

let fixture;
let baseSha;

function git(...args) {
  return execFileSync('git', ['-C', fixture, ...args], { encoding: 'utf8' }).trim();
}

function runVerifierAgainstProbe(relativePath) {
  const absolute = path.join(fixture, relativePath);
  mkdirSync(path.dirname(absolute), { recursive: true });
  appendFileSync(absolute, '\n// synthetic documentation-truth coverage probe\n', 'utf8');
  git('add', '--', relativePath);
  git('-c', 'user.email=coverage@example.test', '-c', 'user.name=coverage', 'commit', '-q', '-m', `probe ${relativePath}`);
  try {
    const result = spawnSync(process.execPath, ['scripts/verify-documentation-truth.mjs'], {
      cwd: fixture,
      encoding: 'utf8',
      env: { ...process.env, DOC_TRUTH_BASE_SHA: baseSha },
    });
    return { status: result.status, output: `${result.stdout}\n${result.stderr}` };
  } finally {
    git('reset', '-q', '--hard', baseSha);
  }
}

before(() => {
  fixture = mkdtempSync(path.join(tmpdir(), 'fcr-doc-truth-coverage-'));
  const archive = execFileSync('git', ['-C', repoRoot, 'archive', '--format=tar', 'HEAD'], {
    maxBuffer: 256 * 1024 * 1024,
  });
  execFileSync('tar', ['-x', '-C', fixture], { input: archive });
  // Exercise the verifier in this checkout, not the committed copy, so rule changes are tested before they are committed.
  copyFileSync(
    path.join(repoRoot, 'scripts', 'verify-documentation-truth.mjs'),
    path.join(fixture, 'scripts', 'verify-documentation-truth.mjs'),
  );
  git('init', '-q');
  git('add', '-A');
  git('-c', 'user.email=coverage@example.test', '-c', 'user.name=coverage', 'commit', '-q', '-m', 'base');
  baseSha = git('rev-parse', 'HEAD');
});

after(() => {
  if (fixture) rmSync(fixture, { recursive: true, force: true });
});

describe('Access split documentation truth coverage', () => {
  for (const changed of [
    'scripts/fcr-access-public-worker-split.mjs',
    'scripts/run-fcr-access-public-worker-split.mjs',
    'scripts/fcr-access-public-worker-split-cli.mjs',
    'scripts/run-fcr-access-split-recovery.node-test.mjs',
    'scripts/reconcile-cloudflare-access-public-zone.mjs',
  ]) {
    test(`change to ${changed} requires a current documentation receipt`, () => {
      const { status, output } = runVerifierAgainstProbe(changed);
      assert.notEqual(status, 0);
      assert.match(output, /truth-sensitive change requires a current documentation receipt/);
    });
  }

  test('control: a change outside the Access split surface does not require a Cloudflare receipt', () => {
    const { output } = runVerifierAgainstProbe('scripts/unrelated-synthetic-tool.mjs');
    assert.doesNotMatch(output, /truth-sensitive change requires a current documentation receipt/);
  });
});
