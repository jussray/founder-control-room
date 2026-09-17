import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const commandBridge = readFileSync('.github/workflows/chief-proofmode-access-command-bridge.yml', 'utf8');
const recoveryWorkflow = readFileSync('.github/workflows/chief-proofmode-access-recovery.yml', 'utf8');
const runtimeWitness = readFileSync('.github/workflows/chief-proofmode-runtime-witness.yml', 'utf8');
const reconciler = readFileSync('scripts/reconcile-chief-proofmode-access.mjs', 'utf8');
const selector = readFileSync('scripts/resolve-chief-proofmode-access-selector.mjs', 'utf8');
const reconciliationState = readFileSync('scripts/chief-proofmode-access-reconciliation-state.mjs', 'utf8');

const ACCOUNT_ID = '9b59861bd1747cf7525571b4c51d2aa0';

test('Chief Access provider mutation is reachable only through the founder issue bridge', () => {
  assert.match(commandBridge, /github\.repository == 'jussray\/founder-control-room'/);
  assert.match(commandBridge, /github\.event\.issue\.number == 485/);
  assert.match(commandBridge, /github\.event\.comment\.user\.login == 'jussray'/);
  assert.match(commandBridge, /\/cloudflare-chief-access/);
  assert.match(commandBridge, /commits\/main/);
  assert.match(commandBridge, /test "\$current_main" = "\$EXPECTED_HEAD_SHA"/);
  assert.match(commandBridge, /uses:\s*\.\/\.github\/workflows\/chief-proofmode-access-recovery\.yml/);
  assert.match(commandBridge, /secrets:\s*inherit/);
  assert.doesNotMatch(commandBridge, /chief-proofmode-access-recovery\.yml\/dispatches/);
  assert.doesNotMatch(commandBridge, /actions:\s*write/);
  assert.doesNotMatch(commandBridge, /CLOUDFLARE_ACCESS_(?:API|ADMIN)_TOKEN/);

  assert.match(recoveryWorkflow, /workflow_call:/);
  assert.doesNotMatch(recoveryWorkflow, /workflow_dispatch:/);
  assert.match(recoveryWorkflow, /github\.repository == 'jussray\/founder-control-room'/);
  assert.match(recoveryWorkflow, /github\.event_name == 'issue_comment'/);
  assert.match(recoveryWorkflow, /github\.event\.issue\.number == 485/);
  assert.match(recoveryWorkflow, /github\.event\.comment\.user\.login == 'jussray'/);
});

test('exact FCR main, immutable Chief target, and explicit repair approval remain mandatory', () => {
  assert.match(recoveryWorkflow, new RegExp(ACCOUNT_ID));
  assert.match(recoveryWorkflow, /current_main.*EXPECTED_HEAD_SHA/s);
  assert.match(recoveryWorkflow, /\^\[0-9a-f\]\{8\}-chief-ai\\\.mcgill-raylene\\\.workers\\\.dev\$/);
  assert.match(recoveryWorkflow, /repair requires an auditable 8-200 character approval_reference/);
  assert.match(recoveryWorkflow, /sha256sum/);
  assert.match(recoveryWorkflow, /APPROVAL_REFERENCE_RECEIPT/);
  assert.doesNotMatch(recoveryWorkflow, /Approval reference:.*APPROVAL_REFERENCE/);
});

test('canonical selector is specificity-first and shared by recovery and runtime witness', () => {
  assert.match(selector, /resolveSpecificFirst/);
  assert.match(selector, /Chief-specific .* conflicts with the generic fallback alias/);
  assert.match(selector, /clientIdSource: client\.source/);
  assert.match(selector, /selectorFingerprint/);
  assert.match(selector, /CHIEF_RUNTIME_ACCESS_CLIENT_ID/);

  for (const workflow of [recoveryWorkflow, runtimeWitness]) {
    assert.match(workflow, /CHIEF_ACCESS_CLIENT_ID_SECRET:\s*\$\{\{ secrets\.CHIEF_CLOUDFLARE_ACCESS_CLIENT_ID \}\}/);
    assert.match(workflow, /CHIEF_ACCESS_CLIENT_ID_VARIABLE:\s*\$\{\{ vars\.CHIEF_CLOUDFLARE_ACCESS_CLIENT_ID \}\}/);
    assert.match(workflow, /GENERIC_ACCESS_CLIENT_ID_SECRET:\s*\$\{\{ secrets\.CLOUDFLARE_ACCESS_CLIENT_ID \}\}/);
    assert.match(workflow, /GENERIC_ACCESS_CLIENT_ID_VARIABLE:\s*\$\{\{ vars\.CLOUDFLARE_ACCESS_CLIENT_ID \}\}/);
    assert.match(workflow, /node scripts\/resolve-chief-proofmode-access-selector\.mjs/);
    assert.doesNotMatch(workflow, /CHIEF_CLOUDFLARE_ACCESS_CLIENT_ID:\s*\$\{\{[^\n]*\|\|/);
  }
});

test('repair latch blocks blind retry and is bound to provider subject', () => {
  assert.match(recoveryWorkflow, /Refuse unresolved prior Chief Access repair/);
  assert.match(recoveryWorkflow, /chief-proofmode-access-reconciliation-state\.mjs/);
  assert.match(recoveryWorkflow, /Persist repair-in-progress reconciliation latch/);
  assert.match(recoveryWorkflow, /disposition=REPAIR_IN_PROGRESS/);
  assert.match(recoveryWorkflow, /RECONCILE_REQUIRED/);
  assert.match(recoveryWorkflow, /Retry authority: `BLOCKED`/);
  assert.match(reconciliationState, /REPAIR_IN_PROGRESS/);
  assert.match(reconciliationState, /RECONCILE_REQUIRED/);
  assert.match(reconciliationState, /subject-v2/);
  assert.match(reconciliationState, /blockedSubjects/);
  assert.match(reconciliationState, /inProgressRuns/);
});

test('provider subject and ambiguous mutation outcome are durable and fail closed', () => {
  assert.match(reconciler, /createChiefAccessSubjectFingerprint/);
  assert.match(reconciler, /chief-access-provider-subject\/v1/);
  assert.match(reconciler, /mutationOutcomeForError/);
  assert.match(reconciler, /provider-write-outcome-unknown/);
  assert.match(reconciler, /provider-write-verification-failed/);
  assert.match(reconciler, /markMutationOutcome\(error,\s*'unknown'\)/);
  assert.match(reconciler, /chiefAccessMutationOutcome/);
  assert.match(recoveryWorkflow, /allowed_mutation_outcome/);
  assert.match(recoveryWorkflow, /\.mutationPerformed == null/);
  assert.match(recoveryWorkflow, /subjectFingerprint/);
});

test('provider repair remains one exact-host Service Auth policy creation only', () => {
  assert.equal([...reconciler.matchAll(/method:\s*'POST'/g)].length, 1);
  assert.match(reconciler, /\/access\/apps\/\$\{encodeURIComponent\(appId\)\}\/policies/);
  assert.match(reconciler, /decision:\s*'non_identity'/);
  assert.match(reconciler, /service_token:\s*\{ token_id: serviceId \}/);
  assert.match(reconciler, /repairEligible:\s*exactHostOnly/);
  assert.match(reconciler, /scope:\s*'preview_worker', repairEligible:\s*false/);
  assert.match(reconciler, /scope:\s*'worker', repairEligible:\s*false/);
  assert.match(reconciler, /refusing automatic overwrite/);
  assert.doesNotMatch(reconciler, /any_valid_service_token/);
  assert.doesNotMatch(reconciler, /decision:\s*'bypass'/);
  assert.doesNotMatch(reconciler, /\/dns_records|\/routes|wrangler|supabase|deploy/i);
});

test('read authority, repair authority, raw receipts, and runtime proof remain separate', () => {
  assert.match(recoveryWorkflow, /CLOUDFLARE_ACCESS_API_TOKEN:\s*\$\{\{ secrets\.CLOUDFLARE_ACCESS_API_TOKEN \}\}/);
  assert.match(recoveryWorkflow, /CLOUDFLARE_ACCESS_ADMIN_API_TOKEN:\s*\$\{\{ secrets\.CLOUDFLARE_ACCESS_ADMIN_API_TOKEN \}\}/);
  assert.match(recoveryWorkflow, /node scripts\/reconcile-chief-proofmode-access\.mjs >\/dev\/null 2>&1/);
  assert.match(recoveryWorkflow, /Browser\/runtime proof: `NOT CLAIMED HERE`/);
  assert.match(recoveryWorkflow, /chief-proofmode-access-public-receipt/);
  const artifact = recoveryWorkflow.match(/- name: Upload sanitized Chief Access evidence([\s\S]*)$/)?.[1] ?? '';
  assert.doesNotMatch(artifact, /chief-proofmode-access-recovery\.json/);
  assert.doesNotMatch(artifact, /chief-proofmode-access-mutation\.json/);
  assert.doesNotMatch(runtimeWitness, /CLOUDFLARE_ACCESS_ADMIN_API_TOKEN/);
  assert.doesNotMatch(runtimeWitness, /CHIEF_ACCESS_MODE:\s*repair/);
});
