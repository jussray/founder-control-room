import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const workflowPath = new URL('../.github/workflows/deploy.yml', import.meta.url);
const wranglerPath = new URL('../wrangler.worker.toml', import.meta.url);
const linkedinBaselinePath = new URL('../config/linkedin-rising-floor-baseline.json', import.meta.url);
const repositoryPolicyPath = new URL('../config/proof-of-ship-repository-policy.json', import.meta.url);
const workflow = readFileSync(workflowPath, 'utf8');
const wrangler = readFileSync(wranglerPath, 'utf8');
const linkedinBaseline = JSON.parse(readFileSync(linkedinBaselinePath, 'utf8'));
const repositoryPolicy = JSON.parse(readFileSync(repositoryPolicyPath, 'utf8'));

function assertNonNegativeInteger(value, label) {
  assert.equal(Number.isInteger(value), true, `${label} must be an integer`);
  assert.ok(value >= 0, `${label} must be non-negative`);
}

function assertIsoDate(value, label) {
  assert.equal(typeof value, 'string', `${label} must be a string`);
  assert.equal(Number.isFinite(Date.parse(value)), true, `${label} must be parseable as a date`);
}

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
  /REPOSITORY_PUBLICATION_POLICY_PATH: config\/proof-of-ship-repository-policy\.json/,
  'proof-of-ship must bind a repo-owned privacy/publication policy',
);
assert.match(
  workflow,
  /sha256sum "\$REPOSITORY_PUBLICATION_POLICY_PATH"/,
  'proof-of-ship must hash the repo-owned publication policy before sending metadata',
);
assert.match(
  workflow,
  /repository_eligibility_receipt/,
  'proof-of-ship must mint an exact-SHA repository eligibility receipt',
);
assert.match(
  workflow,
  /\.repository_eligibility_receipt\.commit_sha == \.commit_sha/,
  'proof-of-ship must bind repository privacy eligibility to the exact commit SHA',
);
assert.match(
  workflow,
  /\.repository_eligibility_receipt\.privacy_safe_marketing_approved == true/,
  'proof-of-ship must require positive privacy-safe marketing approval',
);
assert.match(
  workflow,
  /repository_policy: \{mode: "repo_owned_privacy_receipt", owner: "jussray"\}/,
  'proof-of-ship must encode repo-owned privacy-receipt policy rather than namespace-only authority',
);
assert.match(
  workflow,
  /\(\.repo \| startswith\("jussray\/"\)\)/,
  'proof-of-ship may retain the jussray owner namespace only as a secondary assertion',
);

assert.equal(repositoryPolicy.version, 1, 'repository publication policy schema must remain version 1');
assert.equal(repositoryPolicy.repository, 'jussray/founder-control-room');
assert.equal(repositoryPolicy.owner, 'jussray');
assert.equal(repositoryPolicy.publication_eligible, true);
assert.equal(repositoryPolicy.sensitive_repository, false);
assert.equal(repositoryPolicy.privacy_safe_marketing_contract?.approved, true);
assert.equal(
  typeof repositoryPolicy.privacy_safe_marketing_contract?.contract_id,
  'string',
  'repository publication policy must name an approved privacy contract',
);
assert.ok(
  repositoryPolicy.privacy_safe_marketing_contract.contract_id.length > 0,
  'repository privacy contract id must not be empty',
);
assert.equal(
  Array.isArray(repositoryPolicy.privacy_safe_marketing_contract?.metadata_scope),
  true,
  'repository publication policy must enumerate allowed metadata scope',
);
assert.equal(
  Array.isArray(repositoryPolicy.privacy_safe_marketing_contract?.prohibited_metadata),
  true,
  'repository publication policy must enumerate prohibited metadata',
);
for (const prohibited of [
  'secrets',
  'credentials',
  'private_user_content',
  'teen_or_family_content',
  'journal_content',
  'voice_or_media_content',
  'wellness_content',
]) {
  assert.ok(
    repositoryPolicy.privacy_safe_marketing_contract.prohibited_metadata.includes(prohibited),
    `repository publication policy must prohibit ${prohibited}`,
  );
}

assert.match(
  workflow,
  /LINKEDIN_BASELINE_PATH: config\/linkedin-rising-floor-baseline\.json/,
  'proof-of-ship must bind the checked-in LinkedIn baseline receipt',
);
assert.match(
  workflow,
  /LinkedIn baseline stale/,
  'proof-of-ship must fail closed when the LinkedIn baseline is stale',
);
assert.match(
  workflow,
  /max_age_hours/,
  'proof-of-ship must enforce a maximum LinkedIn baseline age',
);
assert.match(
  workflow,
  /max_period_lag_days/,
  'proof-of-ship must enforce a maximum LinkedIn baseline period lag',
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
assert.equal(typeof linkedinBaseline.account, 'string');
assert.ok(linkedinBaseline.account.length > 0, 'LinkedIn baseline account must not be empty');
assert.equal(typeof linkedinBaseline.baseline_ref, 'string');
assert.ok(
  linkedinBaseline.baseline_ref.startsWith('linkedin-export:'),
  'LinkedIn baseline reference must identify a verified export window',
);
assert.equal(linkedinBaseline.source?.kind, 'linkedin_aggregate_analytics_export');
assert.equal(typeof linkedinBaseline.source?.file_name, 'string');
assert.ok(linkedinBaseline.source.file_name.length > 0, 'LinkedIn source export filename must not be empty');
assertIsoDate(linkedinBaseline.source?.created_at_utc, 'LinkedIn source created_at_utc');
assert.equal(linkedinBaseline.source?.verified, true);
assertIsoDate(linkedinBaseline.period?.start, 'LinkedIn period start');
assertIsoDate(linkedinBaseline.period?.end, 'LinkedIn period end');
assert.equal(typeof linkedinBaseline.period?.complete, 'boolean');
if (linkedinBaseline.period.complete === false) {
  assert.equal(
    linkedinBaseline.partial_day_receipt?.complete,
    false,
    'an incomplete LinkedIn window must retain an explicitly incomplete partial-day receipt',
  );
  assert.equal(
    linkedinBaseline.partial_day_receipt?.date,
    linkedinBaseline.period?.partial_day,
    'partial-day receipt date must match the declared partial day',
  );
}

for (const metric of ['impressions', 'members_reached', 'engagements', 'new_followers', 'total_followers']) {
  assertNonNegativeInteger(linkedinBaseline.current_window?.[metric], `current_window.${metric}`);
}
for (const metric of [
  'current_export_impressions',
  'previous_export_impressions',
  'current_export_engagements',
  'previous_export_engagements',
]) {
  assertNonNegativeInteger(linkedinBaseline.comparable_window?.[metric], `comparable_window.${metric}`);
}
assert.equal(
  linkedinBaseline.comparable_window?.impressions_delta,
  linkedinBaseline.comparable_window.current_export_impressions
    - linkedinBaseline.comparable_window.previous_export_impressions,
  'LinkedIn impressions delta must reconcile to the comparable-window inputs',
);
assert.equal(
  linkedinBaseline.comparable_window?.engagements_delta,
  linkedinBaseline.comparable_window.current_export_engagements
    - linkedinBaseline.comparable_window.previous_export_engagements,
  'LinkedIn engagements delta must reconcile to the comparable-window inputs',
);
assert.equal(typeof linkedinBaseline.comparable_window?.interpretation, 'string');
assert.ok(
  linkedinBaseline.comparable_window.interpretation.length > 0,
  'LinkedIn comparable-window interpretation must not be empty',
);
assert.equal(
  linkedinBaseline.policy?.partial_window_policy,
  'never_classify_an_incomplete_or_rolling_window_as_a_decline_without_like_for_like_evidence',
);
assert.equal(
  linkedinBaseline.policy?.target_mode,
  'beat_previous_verified_floor_without_sacrificing_quality',
);
assert.equal(Number.isInteger(linkedinBaseline.policy?.max_age_hours), true);
assert.ok(
  linkedinBaseline.policy.max_age_hours > 0 && linkedinBaseline.policy.max_age_hours <= 168,
  'LinkedIn baseline max_age_hours must be a positive bounded freshness window',
);
assert.equal(Number.isInteger(linkedinBaseline.policy?.max_period_lag_days), true);
assert.ok(
  linkedinBaseline.policy.max_period_lag_days >= 0 && linkedinBaseline.policy.max_period_lag_days <= 7,
  'LinkedIn baseline max_period_lag_days must be a bounded non-negative lag',
);
assert.equal(
  linkedinBaseline.policy?.stale_behavior,
  'fail_closed_before_linkedin_schedule',
);
assert.equal(linkedinBaseline.policy?.one_off_virality_is_the_goal, false);

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
  'FOUNDER_SESSION_ENCRYPTION_KEY',
  'GITHUB_WEBHOOK_SECRET',
  'GITHUB_APP_ID',
  'GITHUB_PRIVATE_KEY',
  'FCR_REMOTE_MCP_READ_TOKEN',
  'FOUNDER_SIGNAL_AUTOMATION_GRANT_JSON',
  'FOUNDER_SIGNAL_ENGINE_MCP_TOKEN',
  'ZAPIER_FOUNDER_SIGNAL_ENGINE_HOOK_URL',
  'FOUNDER_REVIEW_EMAIL_INGRESS_SECRET',
];

assert.match(
  wrangler,
  /^\[secrets\]\nrequired = \[/m,
  'wrangler.worker.toml must declare required provider-held Worker secrets',
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
    `${name} must be declared as a required provider-held Worker secret`,
  );
}

const uploadedSecretsMatch = deploySection.match(
  /secrets:\s*\|\n((?:\s{12}[A-Z][A-Z0-9_]*\n)+)\s{8}env:/,
);
assert.notEqual(uploadedSecretsMatch, null, 'worker deploy must have a bounded explicit secret upload list');
const uploadedSecrets = uploadedSecretsMatch[1].trim().split(/\s+/);
assert.deepEqual(
  uploadedSecrets,
  ['FOUNDER_SIGNAL_AUTOMATION_GRANT_JSON'],
  'canonical deploy must preserve provider-held runtime secrets and only force the fail-closed automation grant',
);
assert.match(
  deploySection,
  /Existing Worker runtime secrets|Canonical deploy preserves provider-held Worker secrets/,
  'canonical deploy must document preservation of provider-held runtime secrets',
);
assert.match(
  deploySection,
  /"id":"founder-signal-draft-only-v2","enabled":false/,
  'canonical deploy must actively force the broad Founder Signal grant disabled',
);

for (const name of requiredWorkerSecrets.filter(
  (secretName) => secretName !== 'FOUNDER_SIGNAL_AUTOMATION_GRANT_JSON',
)) {
  assert.doesNotMatch(
    deploySection,
    new RegExp(`^          ${name}: \\$\\{\\{ secrets\\.[A-Z0-9_]+ \\}\\}$`, 'm'),
    `${name} must remain provider-held instead of being copied through GitHub Actions`,
  );
}
assert.doesNotMatch(
  deploySection,
  /^          GITHUB_APP_ID: \$\{\{ secrets\.GITHUB_APP_ID \}\}$/m,
  'canonical deploy must not require a second GITHUB_APP_ID Actions secret when APP_ID is the configured source',
);
assert.doesNotMatch(
  deploySection,
  /^          GITHUB_PRIVATE_KEY: \$\{\{ secrets\.GITHUB_PRIVATE_KEY \}\}$/m,
  'canonical deploy must not require a second GITHUB_PRIVATE_KEY Actions secret when APP_PRIVATE_KEY is the configured source',
);
assert.doesNotMatch(
  deploySection,
  /^          DEPLOY_URL: \$\{\{ secrets\.DEPLOY_URL \}\}$/m,
  'canonical deploy must not require DEPLOY_URL as an Actions secret when it is public configuration',
);

assert.doesNotMatch(
  deploySection,
  /apiToken:\s*\$\{\{ secrets\.CLOUDFLARE_API_TOKEN_OLD \}\}/,
  'production Worker deploy must not use a stale Cloudflare credential name',
);
assert.match(
  deploySection,
  /apiToken:\s*\$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/,
  'production Worker deploy must use the canonical Cloudflare API token',
);

const pagesStart = workflow.indexOf('  pages-release:');
const pagesEnd = workflow.indexOf('  # ── 3.', pagesStart);
assert.notEqual(pagesStart, -1, 'pages-release section must exist');
assert.notEqual(pagesEnd, -1, 'pages-release section must have a bounded end');
const pagesSection = workflow.slice(pagesStart, pagesEnd);
assert.match(
  pagesSection,
  /uses: \.\/\.github\/workflows\/pages-production-release\.yml/,
  'canonical production release must use the guarded Pages release workflow',
);
assert.match(
  pagesSection,
  /expected_head_sha: \$\{\{ inputs\.expected_head_sha \}\}/,
  'Pages release must receive the exact founder-approved head SHA',
);
assert.match(
  pagesSection,
  /secrets: inherit/,
  'Pages release must inherit the existing GitHub Actions secret boundary',
);

const smokeTestStart = workflow.indexOf('  smoke-test:');
const proofOfShipStart = workflow.indexOf('  proof-of-ship:', smokeTestStart);
assert.notEqual(smokeTestStart, -1, 'smoke-test section must exist');
assert.notEqual(proofOfShipStart, -1, 'proof-of-ship section must exist');
const smokeTestSection = workflow.slice(smokeTestStart, proofOfShipStart);
assert.match(
  smokeTestSection,
  /BODY=\$\(curl --fail --silent --show-error --dump-header "\$HEADERS" "\$DEPLOY_URL\/health"\)/,
  'production smoke test must call the direct Worker health endpoint',
);
assert.match(
  smokeTestSection,
  /x-founder-control-room-service:/,
  'production smoke test must verify the Worker service-identity header',
);
assert.match(
  smokeTestSection,
  /PUBLIC_URL: https:\/\/foundercontrolroom\.org/,
  'production smoke test must exercise the public Pages origin',
);
assert.match(
  smokeTestSection,
  /VERSION_BODY=.*"\$PUBLIC_URL\/version"/,
  'production smoke test must verify the public Pages proxy version endpoint',
);
assert.match(
  smokeTestSection,
  /body\.get\('gitSha'\) != os\.environ\['EXPECTED_SHA'\]/,
  'production smoke test must require exact deployed commit identity through the public origin',
);

const proofOfShipSection = workflow.slice(proofOfShipStart);
assert.match(
  proofOfShipSection,
  /needs: smoke-test/,
  'proof-of-ship must run only after successful production smoke proof',
);
assert.match(
  proofOfShipSection,
  /if: needs\.smoke-test\.result == 'success'/,
  'proof-of-ship must fail closed unless smoke-test succeeded',
);

const gateStart = workflow.indexOf('      - name: Validate required production configuration');
const gateEnd = workflow.indexOf('      - name: Record authority receipt', gateStart);
assert.notEqual(gateStart, -1, 'production configuration gate must exist');
assert.notEqual(gateEnd, -1, 'production configuration gate must have a bounded end');
const validationStep = workflow.slice(gateStart, gateEnd);

for (const name of ['SUPABASE_DB_URL', 'CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID']) {
  assert.match(
    validationStep,
    new RegExp('^          ' + name + ': \\$\\{\\{ secrets\\.' + name + ' \\}\\}$', 'm'),
    name + ' must be scoped to the pre-migration deployment-plane gate',
  );
  assert.match(
    validationStep,
    new RegExp('^            ' + name + '$', 'm'),
    name + ' must be checked by the pre-migration deployment-plane gate',
  );
}

for (const name of [
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_PUBLISHABLE_KEY',
  'FOUNDER_SESSION_ENCRYPTION_KEY',
  'GITHUB_WEBHOOK_SECRET',
  'GITHUB_APP_ID',
  'GITHUB_PRIVATE_KEY',
  'FCR_REMOTE_MCP_READ_TOKEN',
  'FOUNDER_SIGNAL_ENGINE_MCP_TOKEN',
  'ZAPIER_FOUNDER_SIGNAL_ENGINE_HOOK_URL',
  'FOUNDER_REVIEW_EMAIL_INGRESS_SECRET',
  'DEPLOY_URL',
]) {
  assert.doesNotMatch(
    validationStep,
    new RegExp('^          ' + name + ': \\$\\{\\{ secrets\\.[A-Z0-9_]+ \\}\\}$', 'm'),
    name + ' must not be duplicated into the GitHub deployment-plane authority gate',
  );
  assert.doesNotMatch(
    validationStep,
    new RegExp('^            ' + name + '$', 'm'),
    name + ' must not be required by the GitHub deployment-plane authority gate',
  );
}

assert.match(
  validationStep,
  /Worker runtime secrets remain provider-held and are name-read-back/,
  'authority gate must state the provider-held runtime-secret readback boundary',
);
console.log('Production deployment authority, provider-held Worker secrets, privacy receipt, LinkedIn freshness, and one-Worker binding contract verified.');
