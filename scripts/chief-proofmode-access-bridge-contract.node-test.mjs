import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const commandBridge = readFileSync('.github/workflows/chief-proofmode-access-command-bridge.yml', 'utf8');
const recoveryWorkflow = readFileSync('.github/workflows/chief-proofmode-access-recovery.yml', 'utf8');
const reconciler = readFileSync('scripts/reconcile-chief-proofmode-access.mjs', 'utf8');
const recoveryDoc = readFileSync('docs/CHIEF_PROOFMODE_ACCESS_RECOVERY.md', 'utf8');

const ACCOUNT_ID = '9b59861bd1747cf7525571b4c51d2aa0';

test('Chief Access command bridge is founder-only, issue-scoped, and exact-FCR-main bound', () => {
  assert.match(commandBridge, /github\.event\.issue\.number == 485/);
  assert.match(commandBridge, /github\.event\.comment\.user\.login == 'jussray'/);
  assert.match(commandBridge, /\/cloudflare-chief-access/);
  assert.match(commandBridge, /actions:\s*write/);
  assert.match(commandBridge, /commits\/main/);
  assert.match(commandBridge, /test "\$current_main" = "\$EXPECTED_HEAD_SHA"/);
  assert.match(commandBridge, /chief-proofmode-access-recovery\.yml\/dispatches/);
  assert.doesNotMatch(commandBridge, /CLOUDFLARE_ACCESS_API_TOKEN/);
  assert.doesNotMatch(commandBridge, /CLOUDFLARE_ACCESS_ADMIN_API_TOKEN/);
  assert.doesNotMatch(commandBridge, /CHIEF_CLOUDFLARE_ACCESS_CLIENT_ID/);
  assert.doesNotMatch(commandBridge, /CHIEF_CLOUDFLARE_ACCESS_SERVICE_TOKEN_ID/);
});

test('recovery keeps repair selector mandatory while check may discover one existing bound identity', () => {
  assert.match(recoveryWorkflow, /environment:\s*production/);
  assert.match(recoveryWorkflow, new RegExp(ACCOUNT_ID));
  assert.match(recoveryWorkflow, /CLOUDFLARE_ACCESS_API_TOKEN:\s*\$\{\{ secrets\.CLOUDFLARE_ACCESS_API_TOKEN \}\}/);
  assert.match(recoveryWorkflow, /CLOUDFLARE_ACCESS_ADMIN_API_TOKEN:\s*\$\{\{ secrets\.CLOUDFLARE_ACCESS_ADMIN_API_TOKEN \}\}/);
  assert.match(
    recoveryWorkflow,
    /CHIEF_CLOUDFLARE_ACCESS_CLIENT_ID:\s*\$\{\{ vars\.CHIEF_CLOUDFLARE_ACCESS_CLIENT_ID \|\| vars\.CLOUDFLARE_ACCESS_CLIENT_ID \}\}/,
  );
  assert.match(
    recoveryWorkflow,
    /CHIEF_CLOUDFLARE_ACCESS_SERVICE_TOKEN_ID:\s*\$\{\{ vars\.CHIEF_CLOUDFLARE_ACCESS_SERVICE_TOKEN_ID \|\| vars\.CLOUDFLARE_ACCESS_SERVICE_TOKEN_ID \}\}/,
  );
  assert.doesNotMatch(recoveryWorkflow, /secrets\.CHIEF_CLOUDFLARE_ACCESS_CLIENT_ID/);
  assert.doesNotMatch(recoveryWorkflow, /secrets\.CHIEF_CLOUDFLARE_ACCESS_SERVICE_TOKEN_ID/);
  assert.doesNotMatch(recoveryWorkflow, /secrets\.CLOUDFLARE_ACCESS_CLIENT_ID/);
  assert.doesNotMatch(recoveryWorkflow, /secrets\.CLOUDFLARE_ACCESS_SERVICE_TOKEN_ID/);

  const selectorStep = recoveryWorkflow.match(
    /- name: Require configured Chief service-token identity before repair([\s\S]*?)- name: Inspect current Chief Service Auth with dedicated read authority/,
  )?.[1] ?? '';
  assert.match(selectorStep, /if: inputs\.mode == 'repair'/);
  assert.match(selectorStep, /-z "\$CHIEF_CLOUDFLARE_ACCESS_CLIENT_ID" && -z "\$CHIEF_CLOUDFLARE_ACCESS_SERVICE_TOKEN_ID"/);
  assert.match(selectorStep, /repair requires CHIEF_CLOUDFLARE_ACCESS_CLIENT_ID/);

  assert.match(recoveryWorkflow, /- name: Inspect current Chief Service Auth with dedicated read authority\n\s+if: inputs\.mode == 'check'/);
  assert.match(recoveryWorkflow, /- name: Apply exact-host Chief Service Auth with dedicated admin authority\n\s+if: inputs\.mode == 'repair'/);
  assert.match(recoveryWorkflow, /current_main.*EXPECTED_HEAD_SHA/s);

  assert.match(reconciler, /discoverBoundServiceTokenId/);
  assert.match(reconciler, /normalizedMode === 'check' && !configuredClientId && !configuredServiceTokenId/);
  assert.match(reconciler, /normalizedMode === 'repair' && !configuredClientId && !configuredServiceTokenId/);
  assert.match(reconciler, /service-token identity is required before repair/);
});

test('repair requires founder approval but never publishes the raw approval reference', () => {
  const authorityStep = recoveryWorkflow.match(
    /- name: Verify exact FCR main, target, and founder mutation approval([\s\S]*?)- name: Set up Node 24/,
  )?.[1] ?? '';
  assert.match(authorityStep, /repair requires an auditable 8-200 character approval_reference/);
  assert.match(authorityStep, /sha256sum/);
  assert.match(authorityStep, /APPROVAL_REFERENCE_RECEIPT/);
  assert.doesNotMatch(authorityStep, /Approval reference: \\`\$APPROVAL_REFERENCE\\`/);
});

test('target is restricted to one immutable Chief preview origin in both command and recovery gates', () => {
  const immutable = /\^\[0-9a-f\]\{8\}-chief-ai\\\.mcgill-raylene\\\.workers\\\.dev\$/;
  assert.match(commandBridge, immutable);
  assert.match(recoveryWorkflow, immutable);
  assert.match(reconciler, /IMMUTABLE_CHIEF_HOST/);
  assert.match(reconciler, /url\.protocol !== 'https:'/);
  assert.match(reconciler, /url\.search/);
  assert.match(reconciler, /url\.hash/);
});

test('provider mutation is one exact Access policy POST and never DNS, route, Worker, deploy, or database mutation', () => {
  assert.equal([...reconciler.matchAll(/method:\s*'POST'/g)].length, 1);
  assert.match(reconciler, /\/access\/apps\/\$\{encodeURIComponent\(appId\)\}\/policies/);
  assert.match(reconciler, /decision:\s*'non_identity'/);
  assert.match(reconciler, /service_token:\s*\{ token_id: serviceId \}/);
  assert.doesNotMatch(reconciler, /any_valid_service_token/);
  assert.doesNotMatch(reconciler, /decision:\s*'bypass'/);
  assert.doesNotMatch(reconciler, /\/dns_records|\/routes|wrangler|supabase|deploy/i);
});

test('automatic repair refuses broader Access scopes and conflicting named policy replacement', () => {
  assert.match(reconciler, /repairEligible:\s*exactHostOnly/);
  assert.match(reconciler, /scope:\s*'preview_worker', repairEligible:\s*false/);
  assert.match(reconciler, /scope:\s*'worker', repairEligible:\s*false/);
  assert.match(reconciler, /refusing automatic overwrite/);
  assert.match(reconciler, /not the approved exact immutable-preview host; refusing repair/);
});

test('selector-free discovery is policy-bound and rejects zero or multiple identities', () => {
  assert.match(reconciler, /No existing non-identity service-token binding identifies the Chief CI token/);
  assert.match(reconciler, /Multiple service-token identities are bound to the effective Chief Access application/);
  assert.match(reconciler, /policy\?\.decision === 'non_identity'/);
  assert.match(reconciler, /rule\?\.service_token\?\.token_id/);
});

test('raw provider receipts stay ephemeral and provider commands are suppressed from logs', () => {
  assert.match(recoveryWorkflow, /node scripts\/reconcile-chief-proofmode-access\.mjs >\/dev\/null 2>&1/);
  const artifactStep = recoveryWorkflow.match(
    /- name: Upload sanitized Chief Access evidence([\s\S]*)$/,
  )?.[1] ?? '';
  assert.match(artifactStep, /chief-proofmode-access-public-receipt/);
  assert.doesNotMatch(artifactStep, /chief-proofmode-access-recovery\.json/);
  assert.doesNotMatch(artifactStep, /chief-proofmode-access-mutation\.json/);
});

test('public receipt explicitly keeps browser/runtime proof separate', () => {
  const returnStep = recoveryWorkflow.match(
    /- name: Return sanitized Chief Access receipt to founder control issue([\s\S]*?)- name: Upload sanitized Chief Access evidence/,
  )?.[1] ?? '';
  assert.match(returnStep, /Browser\/runtime proof: `NOT CLAIMED HERE`/);
  assert.match(returnStep, /rerun Chief exact-head Playwright after provider repair/);
  assert.match(returnStep, /Current provider truth: `UNKNOWN`/);
  assert.match(returnStep, /single-document|length == 1/);
  assert.doesNotMatch(returnStep, /cat "\$current_receipt"/);
  assert.doesNotMatch(returnStep, /cat "\$mutation_receipt"/);
});

test('dedicated recovery documentation keeps source, provider, and browser truth separate', () => {
  assert.match(recoveryDoc, /SOURCE CONTRACT \/ PROVIDER REPAIR NOT YET EXECUTED/);
  assert.match(recoveryDoc, /read-only `check` may discover/);
  assert.match(recoveryDoc, /repair still requires/);
  assert.match(recoveryDoc, /CHIEF_CLOUDFLARE_ACCESS_CLIENT_ID/);
  assert.match(recoveryDoc, /CHIEF_CLOUDFLARE_ACCESS_SERVICE_TOKEN_ID/);
  assert.match(recoveryDoc, /CLOUDFLARE_ACCESS_API_TOKEN/);
  assert.match(recoveryDoc, /CLOUDFLARE_ACCESS_ADMIN_API_TOKEN/);
  assert.match(recoveryDoc, /does not prove Chief runtime equivalence/);
  assert.match(recoveryDoc, /rerun failed Chief ProofMode MCP Playwright job/);
  assert.match(recoveryDoc, /rerun failed Chief capability-plan Playwright job/);
  assert.match(recoveryDoc, /If the Chief head moves, the old runtime proof is stale/);
});
