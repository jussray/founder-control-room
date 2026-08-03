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
  migration,
  manifest,
  server,
] = await Promise.all([
  read('src/worker/founderSignalReviewEmail.ts'),
  read('src/founderSignalEmailIngress/email.ts'),
  read('src/founderSignalEmailIngress/receipt.ts'),
  read('src/http/routes/founderSignalReviewEmailIngress.ts'),
  read('supabase/migrations/20260802224500_founder_signal_review_email_receipts.sql'),
  read('wrangler.email.toml'),
  read('src/http/server.ts'),
]);

const edgeForbidden = [
  /buffer/i,
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
  /buffer/i,
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

if (!worker.includes("FOUNDER_REVIEW_EMAIL_INGRESS_SECRET")) {
  fail('email Worker must require the dedicated ingress secret');
}
if (!worker.includes("redirect: 'error'")) {
  fail('email Worker must reject ingest redirects');
}
if (!worker.includes('Review command rejected')) {
  fail('email Worker must use a generic rejection message');
}
if (!receipt.includes("providerActionsRequested: 0")) {
  fail('receipt contract must hard-code zero provider actions');
}
if (!receipt.includes("unknown_or_private_field")) {
  fail('receipt contract must reject unknown/private fields');
}
if (!route.includes("provider_actions_requested: receipt.providerActionsRequested")) {
  fail('backend must persist the zero-action receipt field');
}
if (!route.includes("express.raw") && !server.includes("express.raw({ type: 'application/json', limit: '16kb' })")) {
  fail('signed ingest must use the exact raw JSON body');
}
if (!server.includes("'/ingest/founder-review-email'")) {
  fail('signed review-email ingest route is not mounted');
}

if (!/ENABLE ROW LEVEL SECURITY/i.test(migration)) {
  fail('review-email receipt table must enable RLS');
}
if (/CREATE POLICY/i.test(migration)) {
  fail('review-email receipt migration must not create anon/authenticated policies');
}
if (!/provider_actions_requested\s+INTEGER\s+NOT NULL\s+CHECK\s*\(provider_actions_requested\s*=\s*0\)/i.test(migration)) {
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
  if (columnPattern.test(migration)) fail(`migration includes forbidden column ${forbiddenColumn}`);
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

if (failures.length > 0) {
  for (const failure of failures) console.error(`Review email ingress verification failed: ${failure}`);
  process.exit(1);
}

console.log(
  'Founder review-email ingress verified: isolated Email Worker, bounded parser, signed raw-body intake, sanitized RLS ledger, zero provider actions, no HTTP route, and no embedded secrets.',
);
