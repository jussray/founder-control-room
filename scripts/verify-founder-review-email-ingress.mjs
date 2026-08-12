import { readFile } from 'node:fs/promises';
import process from 'node:process';

const ROOT = new URL('../', import.meta.url);
const read = async (path) => readFile(new URL(path, ROOT), 'utf8');
const failures = [];
const fail = message => failures.push(message);

const [
  worker,
  parser,
  receipt,
  execution,
  emailRoute,
  contextRoute,
  baseMigration,
  hardeningMigration,
  executionMigration,
  manifest,
  apiManifest,
  server,
  workflow,
] = await Promise.all([
  read('src/worker/founderSignalReviewEmail.ts'),
  read('src/founderSignalEmailIngress/email.ts'),
  read('src/founderSignalEmailIngress/receipt.ts'),
  read('src/founderSignalEmailIngress/reviewExecution.ts'),
  read('src/http/routes/founderSignalReviewEmailIngress.ts'),
  read('src/http/routes/founderSignalReviewContexts.ts'),
  read('supabase/migrations/20260802224500_founder_signal_review_email_receipts.sql'),
  read('supabase/migrations/20260803030000_harden_founder_signal_review_email_receipts.sql'),
  read('supabase/migrations/20260812004000_founder_signal_review_execution_bridge.sql'),
  read('wrangler.email.toml'),
  read('wrangler.worker.toml'),
  read('src/http/server.ts'),
  read('.github/workflows/founder-review-email-ingress.yml'),
]);

const edgeForbidden = [
  /buffer_(?:post|method|action|api)/i,
  /from\s+['"][^'"]*buffer/i,
  /zapier/i,
  /hubspot/i,
  /supabase/i,
  /social.*adapter/i,
  /publish_or_send/i,
  /executeFirstPartyPublication/i,
  /providerFactory/i,
  /githubProvider/i,
];
for (const pattern of edgeForbidden) {
  if (pattern.test(worker)) fail(`email Worker contains forbidden authority pattern ${pattern}`);
}

const intakeForbidden = [
  /buffer_(?:post|method|action|api)/i,
  /from\s+['"][^'"]*buffer/i,
  /zapier/i,
  /hubspot/i,
  /executeFirstPartyPublication/i,
  /providerFactory/i,
  /publish_or_send/i,
];
for (const source of [parser, receipt, emailRoute]) {
  for (const pattern of intakeForbidden) {
    if (pattern.test(source)) fail(`raw intake boundary contains forbidden execution pattern ${pattern}`);
  }
}

for (const source of [worker, parser, receipt, emailRoute, contextRoute]) {
  if (/console\.(?:log|info|warn|error)/.test(source)) {
    fail('review-email ingress must not log raw or sanitized message content');
  }
}

if (!worker.includes('MIN_INGRESS_SECRET_LENGTH = 32')) {
  fail('email Worker must require a minimum 32-character shared secret');
}
if (!emailRoute.includes('MIN_INGRESS_SECRET_LENGTH = 32')) {
  fail('backend ingest must require a minimum 32-character shared secret');
}
if (!worker.includes("redirect: 'error'")) {
  fail('email Worker must reject ingest redirects');
}
if (!worker.includes('Review command rejected')) {
  fail('email Worker must use a generic rejection message');
}
if (!parser.includes("sha256(`${messageId}|${rawMessageHash}`)")) {
  fail('replay identity must bind Message-ID and raw message bytes');
}
if (!parser.includes("authorizationState: 'intake_only_unresolved'")) {
  fail('parser must emit unresolved intake state');
}
if (!receipt.includes("authorizationState: 'intake_only_unresolved'")) {
  fail('receipt contract must remain explicitly unresolved');
}
if (!receipt.includes('executionAllowed: false')) {
  fail('receipt contract must hard-code executionAllowed false');
}
if (!receipt.includes('providerActionsRequested: 0')) {
  fail('receipt contract must hard-code zero provider actions');
}
if (!receipt.includes('command_semantics_mismatch')) {
  fail('receipt contract must couple command type, channel, and text');
}
if (receipt.includes('senderVerified')) {
  fail('receipt contract must not claim envelope sender authentication');
}
if (!receipt.includes('unknown_or_private_field')) {
  fail('receipt contract must reject unknown/private fields');
}
if (!emailRoute.includes('authorization_state: receipt.authorizationState')) {
  fail('backend must persist the unresolved intake authorization state');
}
if (!emailRoute.includes('execution_allowed: receipt.executionAllowed')) {
  fail('backend must persist the false intake execution flag');
}
if (!emailRoute.includes('provider_actions_requested: receipt.providerActionsRequested')) {
  fail('backend must persist the zero-action intake receipt field');
}
if (!emailRoute.includes("error?.code === '23505'")) {
  fail('duplicate intake persistence must be classified from the unique-violation code');
}
if (!emailRoute.includes('processFounderSignalReviewCommand')) {
  fail('signed intake must hand off to the separately bounded review command processor');
}
if (!server.includes("express.raw({ type: 'application/json', limit: '16kb' })")) {
  fail('signed email ingest must use the exact raw JSON body');
}
if (!server.includes("'/ingest/founder-review-email'")) {
  fail('signed review-email ingest route is not mounted');
}
if (!server.includes("'/ingest/founder-review-contexts'")) {
  fail('private review-context ingest route is not mounted');
}

if (!contextRoute.includes("req.get('x-proof-of-ship-receipt-token')")) {
  fail('review-context registration must reuse the existing private proof-receipt token boundary');
}
if (!contextRoute.includes('validateFounderSignalReviewContextRegistration')) {
  fail('review-context registration must validate the deterministic token/context contract');
}
if (!execution.includes("event_type: 'founder_review_command'")) {
  fail('execution bridge must emit a dedicated founder_review_command event');
}
if (!execution.includes('provider_execution_receipt_required: true')) {
  fail('provider dispatch must require a downstream execution receipt');
}
if (!execution.includes('providerExecutionProven: false')) {
  fail('provider hook acceptance must never be called provider execution proof');
}
if (!execution.includes('blocked_context_missing')) {
  fail('execution bridge must fail closed when no exact context exists');
}
if (!execution.includes('blocked_deadline_elapsed')) {
  fail('execution bridge must fail closed after the review deadline');
}
if (!execution.includes('ZAPIER_FOUNDER_SIGNAL_ENGINE_HOOK_URL')) {
  fail('execution bridge must use the existing private Zapier orchestration hook');
}
for (const forbidden of [
  'BUFFER_API_KEY',
  'BUFFER_ACCESS_TOKEN',
  'OPENAI_API_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
]) {
  if (execution.includes(forbidden)) {
    fail(`execution bridge must not introduce provider credential ${forbidden}`);
  }
}

if (!/ENABLE ROW LEVEL SECURITY/i.test(baseMigration)) {
  fail('review-email receipt table must enable RLS');
}
if (/CREATE POLICY/i.test(baseMigration) || /CREATE POLICY/i.test(hardeningMigration)) {
  fail('review-email receipt migrations must not create anon/authenticated policies');
}
if (!/authorization_state\s+TEXT\s+NOT NULL\s+DEFAULT\s+'intake_only_unresolved'/i.test(hardeningMigration)) {
  fail('review-email ledger must add unresolved authorization state');
}
if (!/execution_allowed\s+BOOLEAN\s+NOT NULL\s+DEFAULT\s+FALSE/i.test(hardeningMigration)) {
  fail('review-email ledger must add execution_allowed false');
}
if (!/sender_address_matched\s+BOOLEAN\s+NOT NULL\s+DEFAULT\s+TRUE/i.test(hardeningMigration)) {
  fail('review-email ledger must add address-match truth without authentication language');
}
if (!/command_semantics_check/i.test(hardeningMigration)) {
  fail('review-email ledger must enforce exact command semantics');
}
if (!/provider_actions_requested\s+INTEGER\s+NOT NULL\s+CHECK\s*\(provider_actions_requested\s*=\s*0\)/i.test(baseMigration)) {
  fail('review-email intake ledger must enforce zero provider actions');
}
if (!executionMigration.includes('founder_signal_review_contexts')) {
  fail('execution bridge must persist exact private review contexts');
}
if (!executionMigration.includes('founder_signal_review_command_dispatches')) {
  fail('execution bridge must persist idempotent provider dispatch evidence');
}
if ((executionMigration.match(/ENABLE ROW LEVEL SECURITY/gi) ?? []).length < 2) {
  fail('both execution-bridge tables must enable RLS');
}
if (/CREATE POLICY/i.test(executionMigration)) {
  fail('execution-bridge tables must not create anon/authenticated policies');
}
if (!executionMigration.includes("provider 2xx proves hook acceptance, never Buffer execution")) {
  fail('execution migration must preserve provider-acceptance proof semantics');
}

for (const forbiddenColumn of [
  'raw_email',
  'sender_email',
  'recipient_email',
  'quoted_history',
  'attachment',
  'provider_response_body',
]) {
  const columnPattern = new RegExp(`^\\s*${forbiddenColumn}\\s+`, 'im');
  if (
    columnPattern.test(baseMigration)
    || columnPattern.test(hardeningMigration)
    || columnPattern.test(executionMigration)
  ) {
    fail(`review-email migrations include forbidden column ${forbiddenColumn}`);
  }
}

if (!manifest.includes('workers_dev = false')) {
  fail('email Worker must not expose a workers.dev route');
}
if (!manifest.includes('preview_urls = false')) {
  fail('email Worker preview URLs must remain disabled');
}
if (/\[\[routes\]\]/.test(manifest)) {
  fail('email Worker manifest must not create an HTTP route');
}
if (/FOUNDER_REVIEW_EMAIL_INGRESS_SECRET\s*=/.test(manifest)) {
  fail('email Worker manifest must not contain the ingress secret value');
}
if (!apiManifest.includes('"FOUNDER_REVIEW_EMAIL_INGRESS_SECRET"')) {
  fail('api Worker deployment contract must require FOUNDER_REVIEW_EMAIL_INGRESS_SECRET');
}
if (/FOUNDER_REVIEW_EMAIL_INGRESS_SECRET\s*=/.test(apiManifest)) {
  fail('api Worker manifest must not contain the ingress secret value');
}
if (!workflow.includes('20260803030000_harden_founder_signal_review_email_receipts.sql')) {
  fail('focused workflow must run when the forward hardening migration changes');
}
if (!workflow.includes('20260812004000_founder_signal_review_execution_bridge.sql')) {
  fail('focused workflow must run when the execution-bridge migration changes');
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`Review email ingress verification failed: ${failure}`);
  process.exit(1);
}

console.log(
  'Founder review-email ingress verified: isolated Email Worker, immutable intake receipt, deterministic private context registration, RLS-only correlation ledgers, idempotent post-intake Zapier dispatch, deadline and context fail-closed behavior, exact provider-acceptance semantics, and no embedded provider credentials.',
);
