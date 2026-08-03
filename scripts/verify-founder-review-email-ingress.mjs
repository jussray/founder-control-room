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
  route,
  baseMigration,
  hardeningMigration,
  manifest,
  server,
  workflow,
] = await Promise.all([
  read('src/worker/founderSignalReviewEmail.ts'),
  read('src/founderSignalEmailIngress/email.ts'),
  read('src/founderSignalEmailIngress/receipt.ts'),
  read('src/http/routes/founderSignalReviewEmailIngress.ts'),
  read('supabase/migrations/20260802224500_founder_signal_review_email_receipts.sql'),
  read('supabase/migrations/20260803030000_harden_founder_signal_review_email_receipts.sql'),
  read('wrangler.email.toml'),
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

const routeForbidden = [
  /buffer_(?:post|method|action|api)/i,
  /from\s+['"][^'"]*buffer/i,
  /zapier/i,
  /hubspot/i,
  /executeFirstPartyPublication/i,
  /providerFactory/i,
  /publish_or_send/i,
];
for (const pattern of routeForbidden) {
  if (pattern.test(route)) fail(`intake route contains forbidden execution pattern ${pattern}`);
}

for (const source of [worker, parser, receipt, route]) {
  if (/console\.(?:log|info|warn|error)/.test(source)) {
    fail('review-email runtime must not log raw or sanitized message content');
  }
}

if (!worker.includes('MIN_INGRESS_SECRET_LENGTH = 32')) {
  fail('email Worker must require a minimum 32-character shared secret');
}
if (!route.includes('MIN_INGRESS_SECRET_LENGTH = 32')) {
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
  fail('receipt contract must not claim envelope sender verification');
}
if (!receipt.includes('unknown_or_private_field')) {
  fail('receipt contract must reject unknown/private fields');
}
if (!route.includes('authorization_state: receipt.authorizationState')) {
  fail('backend must persist the unresolved authorization state');
}
if (!route.includes('execution_allowed: receipt.executionAllowed')) {
  fail('backend must persist the false execution flag');
}
if (!route.includes('provider_actions_requested: receipt.providerActionsRequested')) {
  fail('backend must persist the zero-action receipt field');
}
if (!route.includes("error?.code === '23505'")) {
  fail('duplicate persistence must be classified from the unique-violation code');
}
if (!server.includes("express.raw({ type: 'application/json', limit: '16kb' })")) {
  fail('signed ingest must use the exact raw JSON body');
}
if (!server.includes("'/ingest/founder-review-email'")) {
  fail('signed review-email ingest route is not mounted');
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
  fail('review-email receipt ledger must enforce zero provider actions');
}
for (const forbiddenColumn of [
  'raw_email',
  'sender_email',
  'recipient_email',
  'quoted_history',
  'attachment',
  'buffer_post_id',
  'provider_receipt',
]) {
  const columnPattern = new RegExp(`^\\s*${forbiddenColumn}\\s+`, 'im');
  if (columnPattern.test(baseMigration) || columnPattern.test(hardeningMigration)) {
    fail(`migration includes forbidden column ${forbiddenColumn}`);
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
if (!workflow.includes('20260803030000_harden_founder_signal_review_email_receipts.sql')) {
  fail('focused workflow must run when the forward hardening migration changes');
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`Review email ingress verification failed: ${failure}`);
  process.exit(1);
}

console.log(
  'Founder review-email ingress verified: isolated Email Worker, bounded parser, strong signed intake, unresolved RLS ledger, execution disabled, exact command semantics, explicit duplicate handling, no HTTP route, and no embedded secrets.',
);
