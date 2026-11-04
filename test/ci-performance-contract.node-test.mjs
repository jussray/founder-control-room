import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const ci = read('.github/workflows/ci.yml');
const quality = read('.github/workflows/quality-gate.yml');
const playwright = read('.github/workflows/playwright.yml');
const pkg = JSON.parse(read('package.json'));

function jobBody(workflow, name) {
  const startPattern = new RegExp('^  ' + name + ':\\s*$', 'm');
  const start = startPattern.exec(workflow);
  assert.ok(start, 'missing job: ' + name);
  const remainder = workflow.slice(start.index + start[0].length);
  const nextJob = /^  [a-zA-Z][a-zA-Z0-9_-]*:\s*$/m.exec(remainder);
  return nextJob ? remainder.slice(0, nextJob.index) : remainder;
}

test('CI runs all four lockfile-bound core lanes with dependency download caching', () => {
  for (const name of ['typecheck', 'lint', 'test', 'e2e']) {
    const body = jobBody(ci, name);
    assert.match(body, /node-version: '24'[\s\S]*?cache: 'npm'/, name + ' missing npm cache');
    assert.match(body, /run: npm ci --no-audit --no-fund/, name + ' must run npm ci');
    assert.match(body, /git rev-parse HEAD/, name + ' missing exact-head assertion');
  }
  const discovery = jobBody(ci, 'test-discovery');
  assert.match(discovery, /node --test test\/ci-performance-contract\.node-test\.mjs/);
  assert.match(jobBody(ci, 'required-gate'), /test-discovery/);
});

test('Quality Gate preserves coverage and release contracts with deterministic installs', () => {
  assert.doesNotMatch(quality, /run: npm install(?:\s|$)/m);
  for (const name of ['typecheck', 'lint', 'unit-tests', 'terminal-contract', 'build', 'qodo-contracts']) {
    const body = jobBody(quality, name);
    assert.match(body, /run: npm ci --no-audit --no-fund/, name + ' must run npm ci');
    assert.match(body, /cache: 'npm'/, name + ' missing npm cache');
  }
  assert.match(jobBody(quality, 'unit-tests'), /npm test -- --coverage/);
  assert.match(jobBody(quality, 'terminal-contract'), /verify:ai-skills/);
  assert.match(jobBody(quality, 'rls-contract'), /verify:rls-contract/);
  assert.match(jobBody(quality, 'build'), /npm run build/);
});

test('separate Playwright workflow builds once then runs the identical complete harness', () => {
  const expected = 'npm run verify:direct-browser && node e2e/pages-auth-callback-proof.mjs && node e2e/direct-browser-run.mjs && node e2e/truth-console-proof.mjs';
  assert.equal(pkg.scripts['test:e2e:prepared'], expected);
  assert.equal(pkg.scripts['test:e2e'], 'npm run build && ' + expected);
  assert.match(playwright, /run: npm ci --no-audit --no-fund/);
  assert.match(playwright, /cache: 'npm'/);
  assert.match(playwright, /npm run build/);
  assert.match(playwright, /npm run test:e2e:prepared/);
  assert.doesNotMatch(playwright, /Make E2E harness use Playwright browser discovery/);
  assert.doesNotMatch(playwright, /path\.write_text\(source\)/);
  assert.match(read('e2e/run.mjs'), /chromium\.launch\(\{ headless: true, args: \['--no-sandbox'\] \}\)/);
});

test('superseded PR runs cancel without cancelling main branch verification', () => {
  for (const [name, workflow] of [['CI', ci], ['Quality Gate', quality]]) {
    assert.match(workflow, /concurrency:/, name + ' must have bounded concurrency');
    assert.ok(workflow.includes("cancel-in-progress: ${{ github.event_name == 'pull_request' }}"), name + ' may cancel PR runs only');
    assert.ok(workflow.includes('github.event.pull_request.number || github.ref'), name + ' must isolate distinct PRs');
  }
});
