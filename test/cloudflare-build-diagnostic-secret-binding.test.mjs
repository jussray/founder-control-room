import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflowUrl = new URL('../.github/workflows/cloudflare-build-diagnostic.yml', import.meta.url);
const workflow = readFileSync(workflowUrl, 'utf8');

test('Cloudflare Build Diagnostic uses only the dedicated FCR user-token secret', () => {
  assert.match(workflow, /environment:\s*production/);
  assert.match(
    workflow,
    /CF_API_TOKEN:\s*\$\{\{\s*secrets\.FCR_CLOUDFLARE_BUILDS_USER_TOKEN\s*\}\}/,
  );
  assert.doesNotMatch(workflow, /secrets\.CLOUDFLARE_BUILDS_API_TOKEN/);
  assert.match(workflow, /FCR_CLOUDFLARE_BUILDS_USER_TOKEN is not available to this workflow/);
});
