import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflowPath = new URL('../.github/workflows/deploy.yml', import.meta.url);
const wranglerPath = new URL('../wrangler.toml', import.meta.url);
const workflow = readFileSync(workflowPath, 'utf8');
const wrangler = readFileSync(wranglerPath, 'utf8');

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

const publicBindings = new Map([
  ['SUPABASE_URL', 'https://oojzfmmywbvficgybaxd.supabase.co'],
  ['FOUNDER_ALLOWED_ORIGINS', 'https://foundercontrolroom.org'],
  ['FOUNDER_API_URL', 'https://foundercontrolroom.org'],
]);

for (const [name, value] of publicBindings) {
  assert.match(
    wrangler,
    new RegExp(`^${name} = "${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"$`, 'm'),
    `${name} must be committed as a public-safe production binding`,
  );
}

const requiredWorkerSecrets = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_PUBLISHABLE_KEY',
  'GITHUB_WEBHOOK_SECRET',
  'GITHUB_APP_ID',
  'GITHUB_PRIVATE_KEY',
  'FOUNDER_SIGNAL_AUTOMATION_GRANT_JSON',
];

assert.match(
  wrangler,
  /^\[secrets\]\nrequired = \[/m,
  'wrangler.toml must declare required Worker secrets',
);

const deploySectionStart = workflow.indexOf('  worker-deploy:');
const deploySectionEnd = workflow.indexOf('  # ── 3.', deploySectionStart);
assert.notEqual(deploySectionStart, -1, 'worker-deploy section must exist');
assert.notEqual(deploySectionEnd, -1, 'worker-deploy section must have a bounded end');
const deploySection = workflow.slice(deploySectionStart, deploySectionEnd);

for (const name of requiredWorkerSecrets) {
  assert.match(
    wrangler,
    new RegExp(`^  "${name}",$`, 'm'),
    `${name} must be declared as a required Worker secret`,
  );
  assert.match(
    deploySection,
    new RegExp(`^            ${name}$`, 'm'),
    `${name} must be listed in wrangler-action secrets`,
  );
}

for (const name of requiredWorkerSecrets.filter(
  (secretName) => secretName !== 'FOUNDER_SIGNAL_AUTOMATION_GRANT_JSON',
)) {
  assert.match(
    deploySection,
    new RegExp(`^          ${name}: \\$\\{\\{ secrets\\.${name} \\}\\}$`, 'm'),
    `${name} must be mapped from the GitHub production environment`,
  );
}

const authoritySectionStart = workflow.indexOf('  authority-gate:');
const migrationSectionStart = workflow.indexOf('  # ── 1.');
const startupValidationIndex = workflow.indexOf(
  '      - name: Validate required production configuration',
);
assert.notEqual(authoritySectionStart, -1, 'authority-gate section must exist');
assert.notEqual(startupValidationIndex, -1, 'startup binding validation step must exist');
assert.ok(
  startupValidationIndex > authoritySectionStart && startupValidationIndex < migrationSectionStart,
  'all production configuration must be validated before Supabase mutation begins',
);

for (const name of [
  'SUPABASE_DB_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_PUBLISHABLE_KEY',
  'GITHUB_WEBHOOK_SECRET',
  'GITHUB_APP_ID',
  'GITHUB_PRIVATE_KEY',
  'CLOUDFLARE_API_TOKEN',
  'CLOUDFLARE_ACCOUNT_ID',
  'DEPLOY_URL',
]) {
  assert.match(
    workflow,
    new RegExp(`^      ${name}: \\$\\{\\{ secrets\\.${name} \\}\\}$`, 'm'),
    `${name} must be available to the pre-migration authority gate`,
  );
  assert.match(
    workflow,
    new RegExp(`^            ${name}$`, 'm'),
    `${name} must be checked by the pre-migration configuration gate`,
  );
}

console.log('Production deployment authority and Worker binding contract verified.');
