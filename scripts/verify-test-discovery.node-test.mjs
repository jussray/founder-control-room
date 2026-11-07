import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./verify-test-discovery.mjs', import.meta.url));
const INCLUDE = 'src/**/*.test.{ts,js}';
const LEGACY_INCLUDE = 'src/**/*.test.ts';

function run(command, args, cwd) {
  return execFileSync(command, args, { cwd, encoding: 'utf8' }).trim();
}

function write(root, path, content) {
  const target = join(root, path);
  mkdirSync(join(target, '..'), { recursive: true });
  writeFileSync(target, content, 'utf8');
}

function config({ include = INCLUDE, exclude } = {}) {
  const excludeLine = exclude === undefined ? '' : `, exclude: ${JSON.stringify(exclude)}`;
  return `import { defineConfig } from 'vitest/config';\n\nexport default defineConfig({ test: { include: ['${include}']${excludeLine} } });\n`;
}

function baseline(undiscovered = [], includePattern = INCLUDE) {
  return JSON.stringify({ includePattern, undiscovered }, null, 2) + '\n';
}

function makeRepo(t, { baseHidden = [], baseInclude = INCLUDE } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'fcr-test-discovery-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  run('git', ['init', '-q'], root);
  run('git', ['config', 'user.email', 'test@example.com'], root);
  run('git', ['config', 'user.name', 'Test'], root);

  write(root, 'vitest.config.ts', config({ include: baseInclude }));
  write(root, 'scripts/verify-test-discovery.mjs', readFileSync(script, 'utf8'));
  write(root, 'scripts/test-discovery-baseline.json', baseline(baseHidden, baseInclude));
  write(root, 'src/visible/visible.test.ts', 'export {};\n');
  write(root, 'src/lib/__tests__/visibleConsole.test.js', 'export {};\n');
  for (const path of baseHidden) write(root, path, 'export {};\n');

  run('git', ['add', '.'], root);
  run('git', ['commit', '-qm', 'base'], root);
  const baseSha = run('git', ['rev-parse', 'HEAD'], root);

  if (baseInclude !== INCLUDE) {
    write(root, 'vitest.config.ts', config());
    write(root, 'scripts/test-discovery-baseline.json', baseline(baseHidden));
  }

  return { root, baseSha };
}

function verify(root, baseSha) {
  return spawnSync(process.execPath, ['scripts/verify-test-discovery.mjs'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, TEST_DISCOVERY_BASE_SHA: baseSha },
  });
}

test('accepts the canonical TypeScript and JavaScript discovery contract', (t) => {
  const { root, baseSha } = makeRepo(t);
  const result = verify(root, baseSha);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Candidate test files under src\/: 2/);
  assert.match(result.stdout, /matched by default npm test discovery: 2/);
  assert.match(result.stdout, /excluded from default npm test discovery: 0/);
});

test('accepts the one approved bootstrap from the legacy TypeScript-only base contract', (t) => {
  const { root, baseSha } = makeRepo(t, { baseInclude: LEGACY_INCLUDE });
  const result = verify(root, baseSha);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /excluded from default npm test discovery: 0/);
});

test('rejects an arbitrary base include pattern during bootstrap', (t) => {
  const { root, baseSha } = makeRepo(t, { baseInclude: 'src/**/__tests__/**/*.test.ts' });
  const result = verify(root, baseSha);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must record an approved includePattern/);
});

test('rejects candidate baseline laundering for newly hidden tests', (t) => {
  const { root, baseSha } = makeRepo(t);
  write(root, 'src/newHidden.spec.ts', 'export {};\n');
  write(root, 'scripts/test-discovery-baseline.json', baseline(['src/newHidden.spec.ts']));

  const result = verify(root, baseSha);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /absent from the base's recorded discovery debt/);
  assert.match(result.stderr, /src\/newHidden\.spec\.ts/);
});

test('rejects an unrecorded test outside the approved discovery contract', (t) => {
  const { root, baseSha } = makeRepo(t);
  write(root, 'src/newHidden.spec.ts', 'export {};\n');

  const result = verify(root, baseSha);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /new tests are excluded from default npm test discovery/);
  assert.match(result.stderr, /src\/newHidden\.spec\.ts/);
});

test('rejects stale debt after a hidden test is paid down', (t) => {
  const { root, baseSha } = makeRepo(t, { baseHidden: ['src/legacy.spec.ts'] });
  renameSync(join(root, 'src/legacy.spec.ts'), join(root, 'src/legacy.test.ts'));

  const result = verify(root, baseSha);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /no longer excluded from default discovery/);
  assert.match(result.stderr, /src\/legacy\.spec\.ts/);
});

test('rejects a regression to a narrower include pattern', (t) => {
  const { root, baseSha } = makeRepo(t);
  write(root, 'vitest.config.ts', config({ include: 'src/**/*.test.ts' }));

  const result = verify(root, baseSha);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /test\.include must be exactly/);
});

test('rejects a comment-spoofed canonical pattern when the effective include is narrower', (t) => {
  const { root, baseSha } = makeRepo(t);
  write(
    root,
    'vitest.config.ts',
    `import { defineConfig } from 'vitest/config';\n\n// ${INCLUDE}\nexport default defineConfig({ test: { include: ['src/**/*.test.ts'] } });\n`,
  );

  const result = verify(root, baseSha);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must export one static defineConfig|test\.include must be exactly/);
});

test('rejects discovery-affecting test.exclude entries', (t) => {
  const { root, baseSha } = makeRepo(t);
  write(root, 'vitest.config.ts', config({ exclude: ['src/visible/visible.test.ts'] }));

  const result = verify(root, baseSha);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /test\.exclude may not hide files/);
});

test('rejects environment-dependent IIFE config that can diverge between verifier and Vitest', (t) => {
  const { root, baseSha } = makeRepo(t);
  write(
    root,
    'vitest.config.ts',
    `import { defineConfig } from 'vitest/config';\n\nexport default defineConfig({ test: (() => typeof process === 'undefined' ? { include: ['${INCLUDE}'] } : { include: ['src/**/*.test.ts'] })() });\n`,
  );

  const result = verify(root, baseSha);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /non-executing static configuration grammar|only static literal values/);
});

test('rejects spread-based config composition instead of executing or interpreting it', (t) => {
  const { root, baseSha } = makeRepo(t);
  write(
    root,
    'vitest.config.ts',
    `import { defineConfig } from 'vitest/config';\n\nexport default defineConfig({ test: { include: ['${INCLUDE}'], ...globalThis.hiddenConfig } });\n`,
  );

  const result = verify(root, baseSha);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /non-executing static configuration grammar|expected an identifier/);
});
