import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const workflowPath = new URL('../.github/workflows/deploy.yml', import.meta.url);
const wranglerPath = new URL('../wrangler.worker.toml', import.meta.url);
const linkedinBaselinePath = new URL('../config/linkedin-rising-floor-baseline.json', import.meta.url);
const workflow = readFileSync(workflowPath, 'utf8');
const wrangler = readFileSync(wranglerPath, 'utf8');
const linkedinBaseline = JSON.parse(readFileSync(linkedinBaselinePath, 'utf8'));

assert.equal(
  existsSync(new URL('../wrangler.toml', import.meta.url)),
  false,
  'the repository root must not expose a Worker config to Cloudflare Pages',
);
assert.equal(
  existsSync(new URL('../wrangler.api.toml', import.meta.url)),
  false,
  'the deleted founder-control-room2 config must stay removed',
);
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
  /command: deploy --config wrangler\.worker\.toml --var GIT_SHA:/,
  'the production workflow must target the surviving Worker config explicitly',
);
assert.doesNotMatch(
  workflow,
  /wrangler\.api\.toml|--config wrangler\.toml/,
  'production deployment must not target a deleted or Pages-visible config',
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

assert.doesNotMatch(
  workflow,
  /repository_allowlist|excluded_repositories|\.repo != "jussray\/Sekret-Bip"/,
  'proof-of-ship eligibility must never regress to a permanent repository allowlist or denylist',
);
assert.match(
  workflow,
  /repository_policy: \{mode: "all_owned_proof_gated", owner: "jussray"\}/,
  'proof-of-ship must encode all-owned proof-gated repository policy',
);
assert.match(
  workflow,
  /\(\.repo \| startswith\("jussray\/"\)\)/,
  'proof-of-ship must require the jussray owner namespace instead of a repo-name allowlist',
);
assert.match(
  workflow,
  /LINKEDIN_BASELINE_PATH: config\/linkedin-rising-floor-baseline\.json/,
  'proof-of-ship must bind the checked-in LinkedIn baseline receipt',
);
assert.match(
  workflow,
  /linkedin_strategy_required = true/,
  'proof-of-ship must mark LinkedIn strategy as required before downstream generation',
);
assert.match(
  workflow,
  /linkedin_rising_floor_ready = false/,
  'the upstream proof payload must remain not-ready until downstream AI completes the strategy fields',
);
for (const field of [
  'linkedin_rising_floor_ready',
  'linkedin_baseline_ref',
  'linkedin_growth_hypothesis',
  'linkedin_24h_gate',
  'linkedin_48h_gate',
  'linkedin_next_mutation',
]) {
  assert.match(
    workflow,
    new RegExp(field),
    `proof-of-ship must hand off required LinkedIn field ${field}`,
  );
}

assert.equal(linkedinBaseline.version, 1, 'LinkedIn baseline receipt schema must remain version 1');
assert.equal(linkedinBaseline.platform, 'linkedin');
assert.equal(linkedinBaseline.account, 'Juss Rayy');
assert.equal(
  linkedinBaseline.baseline_ref,
  'linkedin-export:2026-08-02..2026-08-08',
  'LinkedIn baseline reference must identify the latest verified export window',
);
assert.equal(
  linkedinBaseline.source.file_name,
  'AggregateAnalytics_Juss Rayy_2026-08-02_2026-08-08.xlsx',
  'LinkedIn baseline receipt must point to the verified source export',
);
assert.equal(linkedinBaseline.source.verified, true);
assert.equal(linkedinBaseline.period.complete, false);
assert.equal(linkedinBaseline.period.partial_day, '2026-08-08');
assert.deepEqual(
  linkedinBaseline.current_window,
  {
    impressions: 1248,
    members_reached: 830,
    engagements: 19,
    new_followers: 13,
    total_followers: 40,
  },
  'current LinkedIn baseline metrics must match the verified export',
);
assert.deepEqual(
  linkedinBaseline.partial_day_receipt,
  {
    date: '2026-08-08',
    impressions: 5,
    engagements: 0,
    complete: false,
  },
  'the partial Aug 8 day must remain explicitly incomplete',
);
assert.deepEqual(
  linkedinBaseline.comparable_window,
  {
    start: '2026-08-02',
    end: '2026-08-07',
    current_export_impressions: 1243,
    previous_export_impressions: 1224,
    impressions_delta: 19,
    current_export_engagements: 19,
    previous_export_engagements: 19,
    engagements_delta: 0,
    interpretation: 'no_like_for_like_decline',
  },
  'like-for-like LinkedIn comparison must remain the authoritative trend receipt',
);
assert.equal(
  linkedinBaseline.policy.partial_window_policy,
  'never_classify_an_incomplete_or_rolling_window_as_a_decline_without_like_for_like_evidence',
);
assert.equal(
  linkedinBaseline.policy.target_mode,
  'beat_previous_verified_floor_without_sacrificing_quality',
);
assert.equal(linkedinBaseline.policy.one_off_virality_is_the_goal, false);

const publicBindings = new Map([
  ['SUPABASE_URL', 'https://oojzfmmywbvficgybaxd.supabase.co'],
  ['FOUNDER_ALLOWED_ORIGINS', 'https://foundercontrolroom.org'],
  ['FOUNDER_API_URL', 'https://foundercontrolroom.org'],
]);

assert.match(
  wrangler,
  /^name = "founder-control-room"$/m,
  'the surviving Worker deployment identity must remain founder-control-room',
);
assert.match(
  wrangler,
  /^pattern = "api\.foundercontrolroom\.org"$/m,
  'the surviving Worker must own the API custom domain',
);
assert.doesNotMatch(
  wrangler,
  /^\[assets\]$/m,
  'the API Worker must not take static asset ownership from Pages',
);

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
  'FOUNDER_SIGNAL_ENGINE_MCP_TOKEN',
  'ZAPIER_FOUNDER_SIGNAL_ENGINE_HOOK_URL',
];

assert.match(
  wrangler,
  /^\[secrets\]\nrequired = \[/m,
  'wrangler.worker.toml must declare required Worker secrets',
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

const validationStepStart = authoritySectionStart === -1
  ? -1
  : workflow.indexOf(
      '      - name: Validate required production configuration',
      authoritySectionStart,
    );
const receiptStepStart = validationStepStart === -1
  ? -1
  : workflow.indexOf(
      '      - name: Record authority receipt',
      validationStepStart,
    );
assert.notEqual(validationStepStart, -1, 'startup binding validation step must exist');
assert.notEqual(receiptStepStart, -1, 'authority receipt step must follow configuration validation');
const authoritySection = workflow.slice(authoritySectionStart, migrationSectionStart);
const validationRelativeStart = validationStepStart - authoritySectionStart;
const receiptRelativeStart = receiptStepStart - authoritySectionStart;
const authorityOutsideValidation =
  authoritySection.slice(0, validationRelativeStart)
  + authoritySection.slice(receiptRelativeStart);
const validationStep = workflow.slice(validationStepStart, receiptStepStart);

const requiredAuthoritySecrets = [
  'SUPABASE_DB_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_PUBLISHABLE_KEY',
  'GITHUB_WEBHOOK_SECRET',
  'GITHUB_APP_ID',
  'GITHUB_PRIVATE_KEY',
  'CLOUDFLARE_API_TOKEN',
  'CLOUDFLARE_ACCOUNT_ID',
  'DEPLOY_URL',
  'FOUNDER_SIGNAL_ENGINE_MCP_TOKEN',
  'ZAPIER_FOUNDER_SIGNAL_ENGINE_HOOK_URL',
];
const outsideSecretMapping = new RegExp(
  '^[ \\t]+(?:' + requiredAuthoritySecrets.join('|') + '): \\$\\{\\{ secrets\\.(?:' + requiredAuthoritySecrets.join('|') + ') \\}\\}$',
  'm',
);
assert.doesNotMatch(
  authorityOutsideValidation,
  outsideSecretMapping,
  'required production secrets must be scoped only to the validation step',
);

for (const name of requiredAuthoritySecrets) {
  assert.match(
    validationStep,
    new RegExp('^          ' + name + ': \\$\\{\\{ secrets\\.' + name + ' \\}\\}$', 'm'),
    name + ' must be scoped to the pre-migration configuration gate',
  );
  assert.match(
    validationStep,
    new RegExp('^            ' + name + '$', 'm'),
    name + ' must be checked by the pre-migration configuration gate',
  );
}
console.log('Production deployment authority, proof-of-ship parity, LinkedIn baseline, and one-Worker binding contract verified.');
