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
const revisionGuard = readFileSync(
  'supabase/migrations/20260819093200_merge_intent_revision_guard.sql',
  'utf8',
);
const executionVeto = readFileSync(
  'supabase/migrations/20260819093300_merge_intent_execution_veto.sql',
  'utf8',
);
const enqueueMigration = readFileSync(
  'supabase/migrations/20260819093400_enqueue_merge_intent_reconciliation.sql',
  'utf8',
);
const reapprovalLoop = readFileSync(
  'supabase/migrations/20260819093500_merge_intent_reapproval_loop.sql',
  'utf8',
);
const readinessVocabulary = readFileSync(
  'supabase/migrations/20260819093600_merge_intent_truthful_readiness.sql',
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
    expect(migration).toMatch(/project_id = new\.project_id/);
    expect(migration).toMatch(/coalesce\(btrim\(approved_by\), ''\) <> ''/);
    expect(migration).toMatch(/gate_id = 'merge'/);
    expect(migration).toMatch(/status = 'pass'/);
    expect(migration).toMatch(/order by ran_at desc, id desc/);
    expect(migration).toMatch(/ran_at < now\(\) - interval '15 minutes'/);
    expect(migration).toMatch(/raise exception 'FCR merge approval cannot persist merge intent/);
    expect(migration).toMatch(/on conflict \(mission_id\) do update set/);
  });

  it('backfills or fail-closes every already-approved FCR mission using founder-attributed project-bound proof', () => {
    expect(backfill).toMatch(/m\.status = 'approved'/);
    expect(backfill).toMatch(/lower\(coalesce\(p\.repo_identifier, ''\)\) = 'jussray\/founder-control-room'/);
    expect(backfill).toMatch(/Merge-intent liveness migration blocked/);
    expect(backfill).toMatch(/insert into merge_intents/);
    expect(backfill).toMatch(/cross join lateral/);
    expect(backfill).toMatch(/pgr\.project_id = m\.project_id/);
    expect(backfill).toMatch(/coalesce\(btrim\(pgr\.approved_by\), ''\) <> ''/);
    expect(backfill).toMatch(/order by pgr\.ran_at desc, pgr\.id desc/);
    expect(backfill).toMatch(/then 'expired'/);
    expect(backfill).toMatch(/Merge-intent liveness postcondition failed/);
    expect(backfill).toMatch(/left join merge_intents mi on mi\.mission_id = m\.id/);
  });

  it('keeps merge intent as a projection, never positive approval or provider-mutation authority', () => {
    expect(migration).toMatch(/Never approval or provider-mutation authority/);
    expect(migration).toMatch(/READY does not authorize merge execution/);
    expect(controller).toMatch(/This only removes the liveness veto so guarded \/execute can evaluate full machine evidence, independent review, provider identity, and exact-head authority/);
    expect(controller).not.toMatch(/\.integrate\(/);
    expect(controller).not.toMatch(/\.createBranch\(/);
    expect(controller).not.toMatch(/\.commitPatch\(/);
    expect(controller).not.toMatch(/\.deleteBranch\(/);
    expect(controller).not.toMatch(/applyBranchRuleset/);
  });

  it('uses truthful vocabulary: identity freshness is REVALIDATED, READY is reserved for full policy proof', () => {
    expect(readinessVocabulary).toMatch(/'revalidated'/);
    expect(readinessVocabulary).toMatch(/READY remains reserved for a future\s+(?:--\s*)?projection/);
    expect(readinessVocabulary).toMatch(/REVALIDATED means exact approved PR\/base\/head\/diff identity is fresh enough/);
    expect(controller).toMatch(/state: 'revalidated'/);
    expect(controller).toMatch(/Merge intent identity is REVALIDATED/);
    expect(controller).not.toMatch(/state: 'ready',\n\s*approved_diff_hash/);
  });

  it('distinguishes base drift, candidate drift, expiry, and provider identity drift', () => {
    expect(controller).toMatch(/state: 'expired', stale_reason: 'founder merge proof expired before execution'/);
    expect(controller).toMatch(/state: 'needs_review'/);
    expect(controller).toMatch(/candidate head changed after approval/);
    expect(controller).toMatch(/state: 'stale'/);
    expect(controller).toMatch(/target base moved after approval/);
    expect(controller).toMatch(/provider PR identity changed after approval/);
    expect(controller).toMatch(/independentReviewDiffHash\(diff\)/);
    expect(controller).toMatch(/approved_diff_hash: intent\.approved_diff_hash \?\? observedDiffHash/);
    expect(controller).toMatch(/canonical provider diff hash changed for the approved candidate pair/);
  });

  it('makes revocation states sticky until a new approval revision', () => {
    expect(controller).toMatch(/intent\.state === 'needs_review'/);
    expect(controller).toMatch(/new founder review\/approval revision is required/);
    expect(controller).toMatch(/intent\.state === 'stale'/);
    expect(controller).toMatch(/new revalidation\/approval revision is required/);
    expect(controller).toMatch(/intent\.state === 'expired'/);
    expect(controller).toMatch(/intent\.state === 'cancelled'/);
    expect(controller).toMatch(/intent\.state === 'blocked'/);
  });

  it('uses approval revision plus observed-state compare-and-set against execution/reapproval races', () => {
    expect(revisionGuard).toMatch(/add column if not exists revision bigint not null default 1/);
    expect(revisionGuard).toMatch(/new\.revision := old\.revision \+ 1/);
    expect(revisionGuard).toMatch(/Projection-only writes never get to manufacture a new approval revision/);
    expect(controller).toMatch(/\.eq\('revision', intent\.revision\)/);
    expect(controller).toMatch(/\.eq\('state', intent\.state\)/);
    expect(controller).toMatch(/if \(!data\) return concurrentAdvance\(intent\)/);
    expect(controller).toMatch(/intent\.state === 'executing'/);
    expect(controller).toMatch(/intent\.state === 'merged'/);
  });

  it('uses leased REVALIDATED/READY as a deny-only execution precondition while preserving guarded execute authority', () => {
    expect(executionVeto).toMatch(/before insert on approval_executions/);
    expect(executionVeto).toMatch(/for update/);
    expect(executionVeto).toMatch(/if v_state not in \('revalidated', 'ready'\)/);
    expect(executionVeto).toMatch(/merge intent has no canonical approved diff witness/);
    expect(executionVeto).toMatch(/last_reconciled_at/);
    expect(executionVeto).toMatch(/now\(\) - interval '3 minutes'/);
    expect(executionVeto).toMatch(/revalidation lease is stale/);
    expect(executionVeto).toMatch(/merge intent founder proof lease expired/);
    expect(executionVeto).toMatch(/state = 'executing'/);
    expect(executionVeto).toMatch(/state in \('revalidated', 'ready'\)/);
    expect(executionVeto).toMatch(/execution_id = new\.id/);

    const reservationIndex = approvals.indexOf(".from('approval_executions')\n      .insert");
    const providerMutationIndex = approvals.indexOf('provider.integrate(project.slug, base, head)');
    expect(reservationIndex).toBeGreaterThanOrEqual(0);
    expect(providerMutationIndex).toBeGreaterThan(reservationIndex);
  });

  it('wakes approval/reapproval immediately through the existing append-only outbox', () => {
    expect(enqueueMigration).toMatch(/insert into controller_outbox/);
    expect(enqueueMigration).toMatch(/'MergeIntentController'/);
    expect(enqueueMigration).toMatch(/after insert on merge_intents/);
    expect(enqueueMigration).toMatch(/after update on merge_intents/);
    expect(enqueueMigration).toMatch(/new\.revision is distinct from old\.revision/);
    expect(enqueueMigration).not.toMatch(/after update of revision on merge_intents/);
    expect(enqueueMigration).toMatch(/from merge_intents\nwhere state = 'waiting'/);
  });

  it('returns durable FCR revocations to in_review so explicit founder reapproval can create a new revision', () => {
    expect(reapprovalLoop).toMatch(/after update of state on merge_intents/);
    expect(reapprovalLoop).toMatch(/lower\(new\.repository\) <> 'jussray\/founder-control-room'/);
    expect(reapprovalLoop).toMatch(/new\.state in \('needs_review', 'stale', 'expired', 'blocked'\)/);
    expect(reapprovalLoop).toMatch(/set status = 'in_review'/);
    expect(reapprovalLoop).toMatch(/and status = 'approved'/);
    expect(reapprovalLoop).toMatch(/v_repository = 'jussray\/founder-control-room'/);
    expect(reapprovalLoop).toMatch(/new\.status = 'in_review'/);
    expect(reapprovalLoop).toMatch(/v_intent_state in \('needs_review', 'stale', 'expired', 'blocked'\)/);
    expect(reapprovalLoop).toMatch(/preserves? the sticky revocation state/);
    expect(reapprovalLoop).toMatch(/lower\(mi\.repository\) = 'jussray\/founder-control-room'/);
    expect(reapprovalLoop).toMatch(/Merge-intent reapproval-loop postcondition failed/);
  });

  it('keeps the two-minute approved-mission sweep as a projection-driven fallback', () => {
    expect(scheduler).toMatch(/'approved'/);
    expect(scheduler).toMatch(/\.from\('merge_intents'\)/);
    expect(scheduler).toMatch(/mergeIntentMissionIds/);
    expect(scheduler).toMatch(/mission\.status === 'approved' && mergeIntentMissionIds\.has\(mission\.id\)/);
    expect(scheduler).toMatch(/controller: 'MergeIntentController'/);
    expect(reconciler).toMatch(/import \{ MergeIntentController \}/);
    expect(reconciler).toMatch(/\[["']MergeIntentController["'], new MergeIntentController\(\)\]/);
  });

  it('keeps merge-intent storage service-role-only', () => {
    expect(migration).toMatch(/alter table merge_intents enable row level security/);
    expect(migration).toMatch(/auth\.role\(\) = 'service_role'/);
    expect(migration).toMatch(/revoke all on table merge_intents from anon, authenticated/);
    expect(migration).toMatch(/grant select, insert, update, delete on table merge_intents to service_role/);
  });
});
