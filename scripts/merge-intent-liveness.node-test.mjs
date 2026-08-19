import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  'supabase/migrations/20260819093000_merge_intent_liveness.sql',
  'utf8',
);
const backfill = readFileSync(
  'supabase/migrations/20260819093100_backfill_approved_merge_intents.sql',
  'utf8',
);
const controller = readFileSync('src/controllers/MergeIntentController.ts', 'utf8');
const scheduler = readFileSync('src/worker/scheduler.ts', 'utf8');
const reconciler = readFileSync('src/worker/reconciler.ts', 'utf8');
const approvals = readFileSync('src/http/routes/approvals.ts', 'utf8');

test('FCR approval transition cannot commit without a durable exact-candidate intent', () => {
  assert.match(migration, /create table if not exists merge_intents/);
  assert.match(migration, /mission_id\s+uuid not null unique references missions/);
  assert.match(migration, /repository\s+text not null/);
  assert.match(migration, /pull_request_number\s+integer not null/);
  assert.match(migration, /approved_base_sha\s+text not null/);
  assert.match(migration, /approved_head_sha\s+text not null/);
  assert.match(migration, /approval_proof_id\s+uuid not null references proof_gate_results/);
  assert.match(migration, /review_policy_hash\s+text not null/);
  assert.match(migration, /proof_expires_at\s+timestamptz not null/);
  assert.match(migration, /after update of status on missions/);
  assert.match(migration, /new\.status = 'approved'/);
  assert.match(migration, /v_repository <> 'jussray\/founder-control-room'/);
  assert.match(migration, /gate_id = 'merge'/);
  assert.match(migration, /status = 'pass'/);
  assert.match(migration, /ran_at < now\(\) - interval '15 minutes'/);
  assert.match(migration, /raise exception 'FCR merge approval cannot persist merge intent/);
  assert.match(migration, /on conflict \(mission_id\) do update set/);
});

test('migration backfills or fail-closes every already-approved FCR mission', () => {
  assert.match(backfill, /m\.status = 'approved'/);
  assert.match(backfill, /lower\(coalesce\(p\.repo_identifier, ''\)\) = 'jussray\/founder-control-room'/);
  assert.match(backfill, /Merge-intent liveness migration blocked/);
  assert.match(backfill, /insert into merge_intents/);
  assert.match(backfill, /cross join lateral/);
  assert.match(backfill, /order by pgr\.ran_at desc, pgr\.id desc/);
  assert.match(backfill, /then 'expired'/);
  assert.match(backfill, /Merge-intent liveness postcondition failed/);
  assert.match(backfill, /left join merge_intents mi on mi\.mission_id = m\.id/);
});

test('merge intent is explicitly a projection, never approval or provider mutation authority', () => {
  assert.match(migration, /Never approval or provider-mutation authority/);
  assert.match(migration, /READY does not authorize merge execution/);
  assert.match(controller, /READY is a liveness projection only; guarded \/execute remains merge authority/);
  assert.doesNotMatch(controller, /\.integrate\(/);
  assert.doesNotMatch(controller, /\.createBranch\(/);
  assert.doesNotMatch(controller, /\.commitPatch\(/);
  assert.doesNotMatch(controller, /\.deleteBranch\(/);
  assert.doesNotMatch(controller, /applyBranchRuleset/);
});

test('reconciliation distinguishes base drift, candidate drift, expiry, and provider identity drift', () => {
  assert.match(controller, /setState\(intent, 'expired', 'founder merge proof expired before execution'\)/);
  assert.match(controller, /'needs_review', 'candidate head changed after approval'/);
  assert.match(controller, /'stale', 'target base moved after approval'/);
  assert.match(controller, /'blocked', 'provider PR identity changed after approval'/);
  assert.match(controller, /independentReviewDiffHash\(diff\)/);
  assert.match(controller, /approved_diff_hash: intent\.approved_diff_hash \?\? observedDiffHash/);
  assert.match(controller, /canonical provider diff hash changed for the approved candidate pair/);
});

test('approved missions are swept by the existing durable reconciler chassis', () => {
  assert.match(scheduler, /'approved'/);
  assert.match(scheduler, /mission\.status === 'approved'/);
  assert.match(scheduler, /controller: 'MergeIntentController'/);
  assert.match(reconciler, /import \{ MergeIntentController \}/);
  assert.match(reconciler, /\['MergeIntentController', new MergeIntentController\(\)\]/);
});

test('existing guarded execution ledger drives intent lifecycle without moving execution authority', () => {
  assert.match(migration, /after insert on approval_executions/);
  assert.match(migration, /new\.status = 'pending'/);
  assert.match(migration, /state = 'executing'/);
  assert.match(migration, /new\.status = 'succeeded'/);
  assert.match(migration, /state = 'merged'/);
  assert.match(migration, /new\.status = 'failed'/);
  assert.match(migration, /state = 'blocked'/);

  const reservationIndex = approvals.indexOf(".from('approval_executions')\n      .insert");
  const providerMutationIndex = approvals.indexOf('provider.integrate(project.slug, base, head)');
  assert.ok(reservationIndex >= 0, 'approval execution reservation must still exist');
  assert.ok(providerMutationIndex > reservationIndex, 'reservation must remain before provider mutation');
});

test('merge intent data stays service-role-only', () => {
  assert.match(migration, /alter table merge_intents enable row level security/);
  assert.match(migration, /auth\.role\(\) = 'service_role'/);
  assert.match(migration, /revoke all on table merge_intents from anon, authenticated/);
  assert.match(migration, /grant select, insert, update, delete on table merge_intents to service_role/);
});
