import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const commandBridge = readFileSync('.github/workflows/chief-proofmode-access-command-bridge.yml', 'utf8');
const recoveryWorkflow = readFileSync('.github/workflows/chief-proofmode-access-recovery.yml', 'utf8');
const runtimeWitness = readFileSync('.github/workflows/chief-proofmode-runtime-witness.yml', 'utf8');
const reconciler = readFileSync('scripts/reconcile-chief-proofmode-access.mjs', 'utf8');
const selectorResolver = readFileSync('scripts/resolve-chief-proofmode-access-selector.mjs', 'utf8');
const reconciliationEvaluator = readFileSync('scripts/chief-proofmode-access-reconciliation-state.mjs', 'utf8');
const recoveryDoc = readFileSync('docs/CHIEF_PROOFMODE_ACCESS_RECOVERY.md', 'utf8');

const ACCOUNT_ID = '9b59861bd1747cf7525571b4c51d2aa0';
const STORAGE_FIRST_SELECTOR = /secrets\.CHIEF_CLOUDFLARE_ACCESS_CLIENT_ID\s*\|\|\s*secrets\.CLOUDFLARE_ACCESS_CLIENT_ID\s*\|\|\s*vars\.CHIEF_CLOUDFLARE_ACCESS_CLIENT_ID/;

test('Chief Access command bridge is founder-only, issue-scoped, and exact-FCR-main bound', () => {
  assert.match(commandBridge, /github\.event\.issue\.number == 485/);
  assert.match(commandBridge, /github\.event\.comment\.user\.login == 'jussray'/);
  assert.match(commandBridge, /\/cloudflare-chief-access/);
  assert.match(commandBridge, /actions:\s*write/);
  assert.match(commandBridge, /issues:\s*read/);
  assert.match(commandBridge, /commits\/main/);
  assert.match(commandBridge, /test "\$current_main" = "\$EXPECTED_HEAD_SHA"/);
  assert.match(commandBridge, /Check out exact trusted FCR main reconciliation evaluator/);
  assert.match(commandBridge, /chief-proofmode-access-recovery\.yml\/dispatches/);
  assert.doesNotMatch(commandBridge, /CLOUDFLARE_ACCESS_API_TOKEN/);
  assert.doesNotMatch(commandBridge, /CLOUDFLARE_ACCESS_ADMIN_API_TOKEN/);
  assert.doesNotMatch(commandBridge, /CHIEF_CLOUDFLARE_ACCESS_CLIENT_ID/);
  assert.doesNotMatch(commandBridge, /CHIEF_CLOUDFLARE_ACCESS_SERVICE_TOKEN_ID/);
});

test('recovery latch is subject-bound and blocks blind duplicate repair', () => {
  const dispatchGate = commandBridge.match(
    /- name: Refuse repair dispatch while subject-bound reconciliation is unresolved([\s\S]*?)- name: Dispatch bounded Chief Access recovery/,
  )?.[1] ?? '';
  const recoveryGate = recoveryWorkflow.match(
    /- name: Refuse unresolved prior Chief Access repair([\s\S]*?)- name: Set up Node 24/,
  )?.[1] ?? '';
  const latchStep = recoveryWorkflow.match(
    /- name: Persist repair-in-progress reconciliation latch([\s\S]*?)- name: Inspect current Chief Service Auth with dedicated read authority/,
  )?.[1] ?? '';
  const returnStep = recoveryWorkflow.match(
    /- name: Return sanitized Chief Access receipt to founder control issue([\s\S]*?)- name: Upload sanitized Chief Access evidence/,
  )?.[1] ?? '';

  for (const gate of [dispatchGate, recoveryGate]) {
    assert.match(gate, /gh api --paginate --slurp/);
    assert.match(gate, /chief-proofmode-access-reconciliation-state\.mjs/);
    assert.match(gate, /matching provider subject|subject-bound reconciliation/);
    assert.doesNotMatch(gate, /chief-proofmode-access-reconciliation:v1/);
  }

  assert.match(latchStep, /steps\.selector\.outcome == 'success'/);
  assert.match(latchStep, /chief-proofmode-access-reconciliation:v2/);
  assert.match(latchStep, /disposition=REPAIR_IN_PROGRESS/);
  assert.match(latchStep, /subject=pending/);
  assert.match(recoveryWorkflow, /concurrency:\s*[\s\S]*cancel-in-progress:\s*false/);

  assert.match(returnStep, /RECONCILIATION_GATE_OUTCOME/);
  assert.match(returnStep, /REREAD_OUTCOME/);
  assert.match(returnStep, /reconciliation_disposition='RECONCILE_REQUIRED'/);
  assert.match(returnStep, /reconciliation_disposition='CLEAR'/);
  assert.match(returnStep, /reconciliation_subject/);
  assert.match(returnStep, /chief-proofmode-access-reconciliation:v2/);
  assert.match(returnStep, /subject=\$reconciliation_subject/);
  assert.match(returnStep, /mutation_outcome.*none/s);
  assert.match(returnStep, /REREAD_OUTCOME.*success.*current_state.*configured.*current_subject/s);
  assert.match(returnStep, /same unresolved provider subject/);
  assert.match(returnStep, /cannot clear this latch/);

  assert.match(reconciliationEvaluator, /unresolvedSubjects/);
  assert.match(reconciliationEvaluator, /inProgressRuns/);
  assert.match(reconciliationEvaluator, /unresolvedSubjects\.delete\(marker\.subject\)/);
  assert.match(reconciliationEvaluator, /inProgressRuns\.delete\(marker\.run\)/);
  assert.match(reconciliationEvaluator, /github-actions\[bot\]/);
});

test('recovery and runtime witness share one specificity-first selector resolver', () => {
  assert.match(recoveryWorkflow, /environment:\s*production/);
  assert.match(recoveryWorkflow, new RegExp(ACCOUNT_ID));
  assert.match(recoveryWorkflow, /CLOUDFLARE_ACCESS_API_TOKEN:\s*\$\{\{ secrets\.CLOUDFLARE_ACCESS_API_TOKEN \}\}/);
  assert.match(recoveryWorkflow, /CLOUDFLARE_ACCESS_ADMIN_API_TOKEN:\s*\$\{\{ secrets\.CLOUDFLARE_ACCESS_ADMIN_API_TOKEN \}\}/);

  for (const workflow of [recoveryWorkflow, runtimeWitness]) {
    assert.match(workflow, /CHIEF_ACCESS_CLIENT_ID_SECRET:\s*\$\{\{ secrets\.CHIEF_CLOUDFLARE_ACCESS_CLIENT_ID \}\}/);
    assert.match(workflow, /CHIEF_ACCESS_CLIENT_ID_VARIABLE:\s*\$\{\{ vars\.CHIEF_CLOUDFLARE_ACCESS_CLIENT_ID \}\}/);
    assert.match(workflow, /GENERIC_ACCESS_CLIENT_ID_SECRET:\s*\$\{\{ secrets\.CLOUDFLARE_ACCESS_CLIENT_ID \}\}/);
    assert.match(workflow, /GENERIC_ACCESS_CLIENT_ID_VARIABLE:\s*\$\{\{ vars\.CLOUDFLARE_ACCESS_CLIENT_ID \}\}/);
    assert.match(workflow, /CHIEF_ACCESS_SERVICE_TOKEN_ID_VARIABLE:\s*\$\{\{ vars\.CHIEF_CLOUDFLARE_ACCESS_SERVICE_TOKEN_ID \}\}/);
    assert.match(workflow, /GENERIC_ACCESS_SERVICE_TOKEN_ID_VARIABLE:\s*\$\{\{ vars\.CLOUDFLARE_ACCESS_SERVICE_TOKEN_ID \}\}/);
    assert.match(workflow, /resolve-chief-proofmode-access-selector\.mjs/);
    assert.doesNotMatch(workflow, STORAGE_FIRST_SELECTOR);
  }

  assert.match(recoveryWorkflow, /CHIEF_SELECTOR_REQUIRE_IDENTITY:\s*\$\{\{ inputs\.mode == 'repair' && 'true' \|\| 'false' \}\}/);
  assert.match(runtimeWitness, /CHIEF_SELECTOR_REQUIRE_IDENTITY:\s*'true'/);
  assert.match(runtimeWitness, /CHIEF_RUNTIME_ACCESS_CLIENT_SECRET:\s*\$\{\{ secrets\.CHIEF_CLOUDFLARE_ACCESS_CLIENT_SECRET \|\| secrets\.CLOUDFLARE_ACCESS_CLIENT_SECRET \}\}/);

  assert.match(selectorResolver, /Chief-specific \$\{label\} conflicts with the generic fallback alias/);
  assert.match(selectorResolver, /source: 'chief-specific'/);
  assert.match(selectorResolver, /source: 'generic-fallback'/);
  assert.match(selectorResolver, /selectorFingerprint/);
  assert.doesNotMatch(selectorResolver, /console\.log\([^)]*clientId/);
});

test('repair requires an identity while read-only check may discover one policy-bound identity', () => {
  const selectorStep = recoveryWorkflow.match(
    /- name: Resolve canonical Chief service-token identity([\s\S]*?)- name: Persist repair-in-progress reconciliation latch/,
  )?.[1] ?? '';
  assert.match(selectorStep, /id: selector/);
  assert.match(selectorStep, /CHIEF_SELECTOR_REQUIRE_IDENTITY/);
  assert.match(selectorStep, /resolve-chief-proofmode-access-selector\.mjs/);

  assert.match(recoveryWorkflow, /- name: Inspect current Chief Service Auth with dedicated read authority\n\s+if: inputs\.mode == 'check'/);
  assert.match(recoveryWorkflow, /- name: Apply exact-host Chief Service Auth with dedicated admin authority\n\s+id: apply\n\s+if: inputs\.mode == 'repair'/);
  assert.match(recoveryWorkflow, /current_main.*EXPECTED_HEAD_SHA/s);

  assert.match(reconciler, /discoverBoundServiceTokenId/);
  assert.match(reconciler, /normalizedMode === 'check' && !configuredClientId && !configuredServiceTokenId/);
  assert.match(reconciler, /normalizedMode === 'repair' && !configuredClientId && !configuredServiceTokenId/);
  assert.match(reconciler, /service-token identity is required before repair/);
});

test('repair requires founder approval but never publishes the raw approval reference', () => {
  const authorityStep = recoveryWorkflow.match(
    /- name: Verify exact FCR main, target, and founder mutation approval([\s\S]*?)- name: Refuse unresolved prior Chief Access repair/,
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

test('provider receipts bind reconciliation to a non-secret subject fingerprint', () => {
  assert.match(reconciler, /createChiefAccessSubjectFingerprint/);
  assert.match(reconciler, /chief-access-provider-subject\/v1/);
  assert.match(reconciler, /targetOrigin/);
  assert.match(reconciler, /applicationId/);
  assert.match(reconciler, /serviceTokenId/);
  assert.match(reconciler, /subjectFingerprint/);
  assert.match(reconciler, /chiefAccessSubjectFingerprint/);

  const returnStep = recoveryWorkflow.match(
    /- name: Return sanitized Chief Access receipt to founder control issue([\s\S]*?)- name: Upload sanitized Chief Access evidence/,
  )?.[1] ?? '';
  assert.match(returnStep, /subjectFingerprint/);
  assert.match(returnStep, /Reconciliation subject/);
  assert.match(returnStep, /Client selector source class/);
  assert.match(returnStep, /Service-token selector source class/);
  assert.match(returnStep, /targetOrigin, accessScope, policyId, subjectFingerprint/);
  assert.doesNotMatch(returnStep, /targetOrigin, accessScope, applicationId, policyId, serviceTokenId/);
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

test('repair preserves uncertain mutation receipt and rereads provider state before any retry', () => {
  const applyStep = recoveryWorkflow.match(
    /- name: Apply exact-host Chief Service Auth with dedicated admin authority([\s\S]*?)- name: Re-read repaired policy with provider authority/,
  )?.[1] ?? '';
  const rereadStep = recoveryWorkflow.match(
    /- name: Re-read repaired policy with provider authority([\s\S]*?)- name: Return sanitized Chief Access receipt to founder control issue/,
  )?.[1] ?? '';

  assert.match(applyStep, /set \+e/);
  assert.match(applyStep, /status=\$\?/);
  assert.match(applyStep, /chief-proofmode-access-mutation\.json/);
  assert.match(applyStep, /exit "\$status"/);
  assert.match(rereadStep, /id: reread/);
  assert.match(rereadStep, /always\(\)/);
  assert.match(rereadStep, /steps\.selector\.outcome == 'success'/);
  assert.match(rereadStep, /CHIEF_ACCESS_MODE: check/);
  assert.match(reconciler, /provider-write-outcome-unknown/);
  assert.match(reconciler, /provider-write-verification-failed/);
  assert.match(reconciler, /mutationOutcome/);
});

test('public receipt explicitly keeps browser/runtime proof separate', () => {
  const returnStep = recoveryWorkflow.match(
    /- name: Return sanitized Chief Access receipt to founder control issue([\s\S]*?)- name: Upload sanitized Chief Access evidence/,
  )?.[1] ?? '';
  assert.match(returnStep, /Browser\/runtime proof: `NOT CLAIMED HERE`/);
  assert.match(returnStep, /rerun Chief exact-head Playwright after provider repair/);
  assert.match(returnStep, /Current provider truth: `UNKNOWN`/);
  assert.match(returnStep, /Current provider truth: `BLOCKED`/);
  assert.match(returnStep, /\.state == "configured" or \.state == "blocked"/);
  assert.match(returnStep, /schemaVersion == 2/);
  assert.match(returnStep, /mutationOutcome/);
  assert.match(returnStep, /provider-write-outcome-unknown/);
  assert.match(returnStep, /reasonCode/);
  assert.match(returnStep, /length == 1/);
  assert.doesNotMatch(returnStep, /cat "\$current_receipt"/);
  assert.doesNotMatch(returnStep, /cat "\$mutation_receipt"/);
  assert.doesNotMatch(returnStep, /error\.message|rawError|errorMessage/);
});

test('blocked diagnostics preserve none, performed, or unknown mutation truth without granting authority', () => {
  assert.match(reconciler, /BLOCKED_REASON_CODES/);
  assert.match(reconciler, /state: 'blocked'/);
  assert.match(reconciler, /mutationOutcomeForError/);
  assert.match(reconciler, /mutationPerformed/);
  assert.match(reconciler, /reasonCode/);
  assert.match(recoveryWorkflow, /allowed_reason/);
  assert.match(recoveryWorkflow, /allowed_mutation_outcome/);
  assert.match(recoveryWorkflow, /\.mutationPerformed == null/);
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
