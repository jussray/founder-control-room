import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

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

describe('merge intent liveness contract', () => {
  it('cannot commit an FCR approval transition without a durable exact-candidate intent', () => {
    expect(migration).toMatch(/create table if not exists merge_intents/);
    expect(migration).toMatch(/mission_id\s+uuid not null unique references missions/);
    expect(migration).toMatch(/repository\s+text not null/);
    expect(migration).toMatch(/pull_request_number\s+integer not null/);
    expect(migration).toMatch(/approved_base_sha\s+text not null/);
    expect(migration).toMatch(/approved_head_sha\s+text not null/);
    expect(migration).toMatch(/approval_proof_id\s+uuid not null references proof_gate_results/);
    expect(migration).toMatch(/review_policy_hash\s+text not null/);
    expect(migration).toMatch(/proof_expires_at\s+timestamptz not null/);
    expect(migration).toMatch(/after update of status on missions/);
    expect(migration).toMatch(/new\.status = 'approved'/);
    expect(migration).toMatch(/v_repository <> 'jussray\/founder-control-room'/);
    expect(migration).toMatch(/gate_id = 'merge'/);
    expect(migration).toMatch(/status = 'pass'/);
    expect(migration).toMatch(/ran_at < now\(\) - interval '15 minutes'/);
    expect(migration).toMatch(/raise exception 'FCR merge approval cannot persist merge intent/);
    expect(migration).toMatch(/on conflict \(mission_id\) do update set/);
  });

  it('backfills or fail-closes every already-approved FCR mission', () => {
    expect(backfill).toMatch(/m\.status = 'approved'/);
    expect(backfill).toMatch(/lower\(coalesce\(p\.repo_identifier, ''\)\) = 'jussray\/founder-control-room'/);
    expect(backfill).toMatch(/Merge-intent liveness migration blocked/);
    expect(backfill).toMatch(/insert into merge_intents/);
    expect(backfill).toMatch(/cross join lateral/);
    expect(backfill).toMatch(/order by pgr\.ran_at desc, pgr\.id desc/);
    expect(backfill).toMatch(/then 'expired'/);
    expect(backfill).toMatch(/Merge-intent liveness postcondition failed/);
    expect(backfill).toMatch(/left join merge_intents mi on mi\.mission_id = m\.id/);
  });

  it('keeps merge intent as a projection, never approval or provider-mutation authority', () => {
    expect(migration).toMatch(/Never approval or provider-mutation authority/);
    expect(migration).toMatch(/READY does not authorize merge execution/);
    expect(controller).toMatch(/READY is a liveness projection only; guarded \/execute remains merge authority/);
    expect(controller).not.toMatch(/\.integrate\(/);
    expect(controller).not.toMatch(/\.createBranch\(/);
    expect(controller).not.toMatch(/\.commitPatch\(/);
    expect(controller).not.toMatch(/\.deleteBranch\(/);
    expect(controller).not.toMatch(/applyBranchRuleset/);
  });

  it('distinguishes base drift, candidate drift, expiry, and provider identity drift', () => {
    expect(controller).toMatch(/setState\(intent, 'expired', 'founder merge proof expired before execution'\)/);
    expect(controller).toMatch(/'needs_review', 'candidate head changed after approval'/);
    expect(controller).toMatch(/'stale', 'target base moved after approval'/);
    expect(controller).toMatch(/'blocked', 'provider PR identity changed after approval'/);
    expect(controller).toMatch(/independentReviewDiffHash\(diff\)/);
    expect(controller).toMatch(/approved_diff_hash: intent\.approved_diff_hash \?\? observedDiffHash/);
    expect(controller).toMatch(/canonical provider diff hash changed for the approved candidate pair/);
  });

  it('sweeps approved missions through the existing durable reconciler chassis', () => {
    expect(scheduler).toMatch(/'approved'/);
    expect(scheduler).toMatch(/mission\.status === 'approved'/);
    expect(scheduler).toMatch(/controller: 'MergeIntentController'/);
    expect(reconciler).toMatch(/import \{ MergeIntentController \}/);
    expect(reconciler).toMatch(/\['MergeIntentController', new MergeIntentController\(\)\]/);
  });

  it('projects the existing guarded execution ledger without moving execution authority', () => {
    expect(migration).toMatch(/after insert on approval_executions/);
    expect(migration).toMatch(/new\.status = 'pending'/);
    expect(migration).toMatch(/state = 'executing'/);
    expect(migration).toMatch(/new\.status = 'succeeded'/);
    expect(migration).toMatch(/state = 'merged'/);
    expect(migration).toMatch(/new\.status = 'failed'/);
    expect(migration).toMatch(/state = 'blocked'/);

    const reservationIndex = approvals.indexOf(".from('approval_executions')\n      .insert");
    const providerMutationIndex = approvals.indexOf('provider.integrate(project.slug, base, head)');
    expect(reservationIndex).toBeGreaterThanOrEqual(0);
    expect(providerMutationIndex).toBeGreaterThan(reservationIndex);
  });

  it('keeps merge-intent storage service-role-only', () => {
    expect(migration).toMatch(/alter table merge_intents enable row level security/);
    expect(migration).toMatch(/auth\.role\(\) = 'service_role'/);
    expect(migration).toMatch(/revoke all on table merge_intents from anon, authenticated/);
    expect(migration).toMatch(/grant select, insert, update, delete on table merge_intents to service_role/);
  });
});
