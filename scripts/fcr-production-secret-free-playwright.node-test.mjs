import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const witness = readFileSync('e2e/production-release-sha.spec.ts', 'utf8');
const workflow = readFileSync('.github/workflows/pages-production-release.yml', 'utf8');

test('production Access credentials do not enter Playwright APIRequestContext traces', () => {
  assert.match(witness, /const response = await fetch\(\x60\$\{deployUrl\}\/version/);
  assert.doesNotMatch(witness, /request\.get\(\x60\$\{deployUrl\}/);
  assert.doesNotMatch(witness, /page\.request/);
  assert.match(witness, /redirect: 'manual'/);
  assert.match(witness, /AbortSignal\.timeout\(20_000\)/);
});

test('both credentialled proof callers pin the canonical API origin', () => {
  assert.match(witness, /toBe\('https:\/\/api\.foundercontrolroom\.org'\)/);
  assert.match(workflow, /test "\$DEPLOY_URL" = "https:\/\/api\.foundercontrolroom\.org"/);
  assert.match(witness, /'CF-Access-Client-Secret': accessClientSecret/);
  assert.match(workflow, /CF-Access-Client-Secret: \$FCR_ACCESS_CLIENT_SECRET/);
});
