import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./verify-test-discovery.mjs', import.meta.url));
const CURRENT_INCLUDE_PATTERN = 'src/**/*.test.ts';

function run(command, args, cwd) {
  return execFileSync(command, args, { cwd, encoding: 'utf8' }).trim();
}

function write(root, path, content) {
  const target = join(root, path);
  mkdirSync(join(target, '..'), { recursive: true });
  writeFileSync(target, content, 'utf8');
}

function makeRepo(t) {
  const root = mkdtempSync(join(tmpdir(), 'fcr-test-discovery-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  run('git', ['init', '-q'], root);
  run('git', ['config', 'user.email', 'test@example.com'], root);
  run('git', ['config', 'user.name', 'Test'], root);

  write(root, 'vitest.config.ts', `export default { test: { include: ['${CURRENT_INCLUDE_PATTERN}'] } };\n`);
  write(root, 'scripts/verify-test-discovery.mjs', readFileSync(script, 'utf8'));
  write(root, 'src/visible/__tests__/visible.test.ts', 'export {};\n');
  write(root, 'src/visible/colocated.test.ts', 'export {};\n');
  write(root, 'src/lib/__tests__/legacyConsole.test.js', 'export {};\n');
  run('git', ['add', '.'], root);
  run('git', ['commit', '-qm', 'base'], root);
  const baseSha = run('git', ['rev-parse', 'HEAD'], root);

  write(root, 'scripts/test-discovery-baseline.json', JSON.stringify({
    includePattern: CURRENT_INCLUDE_PATTERN,
    undiscovered: ['src/lib/__tests__/legacyConsole.test.js'],
  }, null, 2));
  run('git', ['add', '.'], root);
  run('git', ['commit', '-qm', 'candidate'], root);
  return { root, baseSha };
}

function verify(root, baseSha) {
  return spawnSync(process.execPath, ['scripts/verify-test-discovery.mjs'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, TEST_DISCOVERY_BASE_SHA: baseSha },
  });
}

test('permits the base-derived baseline while discovering colocated TypeScript tests', (t) => {
  const { root, baseSha } = makeRepo(t);
  const result = verify(root, baseSha);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Candidate test files under src\/: 3/);
  assert.match(result.stdout, /matched by default npm test discovery: 2/);
  assert.match(result.stdout, /excluded from default npm test discovery: 1/);
});

test('rejects a newly hidden JavaScript test appended to the candidate baseline', (t) => {
  const { root, baseSha } = makeRepo(t);
  write(root, 'src/newHidden.test.js', 'export {};\n');
  write(root, 'scripts/test-discovery-baseline.json', JSON.stringify({
    includePattern: CURRENT_INCLUDE_PATTERN,
    undiscovered: [
      'src/lib/__tests__/legacyConsole.test.js',
      'src/newHidden.test.js',
    ],
  }, null, 2));

  const result = verify(root, baseSha);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /absent from the base's default-discovery debt/);
  assert.match(result.stderr, /src\/newHidden\.test\.js/);
});

test('rejects a stale baseline entry after hidden debt is removed', (t) => {
  const { root, baseSha } = makeRepo(t);
  rmSync(join(root, 'src/lib/__tests__/legacyConsole.test.js'));

  const result = verify(root, baseSha);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /no longer excluded from default discovery/);
  assert.match(result.stderr, /legacyConsole\.test\.js/);
});

test('detects an unrecorded JavaScript test excluded by the TypeScript-only include', (t) => {
  const { root, baseSha } = makeRepo(t);
  write(root, 'scripts/test-discovery-baseline.json', JSON.stringify({
    includePattern: CURRENT_INCLUDE_PATTERN,
    undiscovered: [],
  }, null, 2));

  const result = verify(root, baseSha);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /new tests are excluded from default npm test discovery/);
  assert.match(result.stderr, /src\/lib\/__tests__\/legacyConsole\.test\.js/);
});

test('rejects an unsupported include pattern rather than guessing discovery semantics', (t) => {
  const { root, baseSha } = makeRepo(t);
  write(root, 'vitest.config.ts', "export default { test: { include: ['src/**/*.{test,spec}.ts'] } };\n");
  write(root, 'scripts/test-discovery-baseline.json', JSON.stringify({
    includePattern: 'src/**/*.{test,spec}.ts',
    undiscovered: [],
  }, null, 2));

  const result = verify(root, baseSha);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /unsupported Vitest include pattern/);
});
