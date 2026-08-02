import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflowPath = new URL('../.github/workflows/deploy.yml', import.meta.url);
const workflow = readFileSync(workflowPath, 'utf8');

assert.match(
  workflow,
  /^on:\n  workflow_dispatch:/m,
  'production deployment must be manually dispatched',
);
assert.doesNotMatch(
  workflow,
  /^  push:/m,
  'a normal push or merge must never trigger production deployment',
);
assert.match(
  workflow,
  /expected_head_sha:/,
  'production deployment must require an exact approved head SHA',
);
assert.match(
  workflow,
  /deployment_approval_id:/,
  'production deployment must require an auditable approval reference',
);
assert.match(
  workflow,
  /CURRENT_MAIN_SHA=.*refs\/remotes\/origin\/main/,
  'the authority gate must compare the approved SHA with current main',
);
assert.match(
  workflow,
  /test "\$CURRENT_MAIN_SHA" = "\$EXPECTED_HEAD_SHA"/,
  'stale heads must be rejected before migration or deployment',
);
assert.match(
  workflow,
  /needs: authority-gate/,
  'production mutation jobs must depend on the authority gate',
);
assert.match(
  workflow,
  /ref: \$\{\{ inputs\.expected_head_sha \}\}/,
  'every production checkout must bind to the approved exact head',
);
assert.match(
  workflow,
  /--var GIT_SHA:\$\{\{ inputs\.expected_head_sha \}\}/,
  'the deployed version marker must use the approved exact head',
);
assert.match(
  workflow,
  /"enabled":false/,
  'Founder Signal auto-distribution must deploy disabled by default',
);
assert.doesNotMatch(
  workflow,
  /"enabled":true/,
  'the deployment workflow must not contain an enabled standing distribution grant',
);
assert.match(
  workflow,
  /grant != \{'configured': True, 'enabled': False\}/,
  'post-deploy proof must fail unless social distribution reads back disabled',
);

console.log('Production deployment authority contract verified.');
