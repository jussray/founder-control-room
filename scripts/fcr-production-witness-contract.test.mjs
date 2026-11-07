import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const playwright = readFileSync(new URL('../.github/workflows/playwright.yml', import.meta.url), 'utf8');
const deploy = readFileSync(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8');

test('production witness is restricted to successful manual Deploy on main', () => {
  assert.match(playwright, /production-release-witness:\s*\n\s*if:.*github\.event_name == 'workflow_run'.*github\.event\.workflow_run\.event == 'workflow_dispatch'.*github\.event\.workflow_run\.head_branch == 'main'.*github\.event\.workflow_run\.conclusion == 'success'/);
  assert.match(playwright, /EXPECTED_RELEASE_SHA: \$\{\{ github\.event\.workflow_run\.head_sha \}\}/);
});
test('production witness checks the live deployed release with Playwright', () => {
  assert.match(playwright, /PRODUCTION_RELEASE_WITNESS_REQUIRED: 'true'/);
  assert.match(playwright, /npx playwright test e2e\/production-release-sha\.spec\.ts/);
  assert.match(playwright, /environment: production/);
});
test('deploy remains manual with exact head and approval reference', () => {
  assert.match(deploy, /workflow_dispatch:/);
  assert.match(deploy, /expected_head_sha:/);
  assert.match(deploy, /deployment_approval_id:/);
  assert.match(deploy, /test "\$ACTUAL_HEAD_SHA" = "\$EXPECTED_HEAD_SHA"/);
  assert.match(deploy, /test "\$CURRENT_MAIN_SHA" = "\$EXPECTED_HEAD_SHA"/);
});
