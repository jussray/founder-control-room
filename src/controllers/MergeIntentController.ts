import { BaseController } from './base.js';
import { supabase } from '../lib/supabaseClient.js';
import {
  providerConfigurationError,
  providerForProject,
  type ProviderProjectConfig,
} from '../providers/providerFactory.js';
import { independentReviewDiffHash } from '../review/independentReviewGate.js';
import type { ReconcileRequest, ReconcileResult } from '../reconciliation/types.js';
import type { RepositoryProvider } from '../providers/RepositoryProvider.js';

const FCR_REPOSITORY = 'jussray/founder-control-room';
const FULL_SHA = /^[0-9a-f]{40}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;

type MergeIntentState =
  | 'waiting'
  | 'ready'
  | 'stale'
  | 'needs_review'
  | 'executing'
  | 'merged'
  | 'cancelled'
  | 'expired'
  | 'blocked';

interface MergeIntentRow {
  id: string;
  mission_id: string;
  project_id: string;
  repository: string;
  pull_request_number: number;
  target_branch: string;
  source_branch: string;
  approved_base_sha: string;
  approved_head_sha: string;
  approved_diff_hash: string | null;
  approval_proof_id: string;
  approved_by: string;
  approved_author_identity: string;
  review_policy_hash: string;
  proof_expires_at: string;
  state: MergeIntentState;
  failure_count: number;
}

interface MissionRow {
  id: string;
  project_id: string;
  status: string;
  branch_ref: string | null;
  base_ref: string | null;
  policy_snapshot: Record<string, unknown> | null;
}

interface ProjectRow {
  slug: string;
  repo_provider: string;
  repo_identifier: string | null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function lower(value: unknown): string {
  return text(value).toLowerCase();
}

function configuredProvider(project: ProjectRow): RepositoryProvider {
  if (!project.repo_identifier) {
    throw new Error('merge intent project has no repository identifier');
  }
  const config: ProviderProjectConfig = {
    slug: project.slug,
    repo_provider: project.repo_provider,
    repo_identifier: project.repo_identifier,
  };
  const configurationError = providerConfigurationError(config);
  if (configurationError) throw new Error(configurationError);
  return providerForProject(config);
}

function result(
  status: ReconcileResult['status'],
  message: string,
  previousState?: string,
  nextState?: string,
): ReconcileResult {
  return {
    status,
    observedChanges: previousState && nextState && previousState !== nextState
      ? [{
          resourceType: 'merge_intent',
          resourceId: 'current',
          field: 'state',
          previousValue: previousState,
          newValue: nextState,
        }]
      : [],
    proposedActions: [],
    evidenceIds: [],
    requiresApproval: false,
    message,
  };
}

export class MergeIntentController extends BaseController {
  readonly name = 'MergeIntentController';

  protected async reconcile(req: ReconcileRequest): Promise<ReconcileResult> {
    if (!req.resourceId) {
      return result('blocked', 'Merge intent reconciliation requires a mission id.');
    }

    const { data: rawIntent, error: intentError } = await supabase
      .from('merge_intents')
      .select([
        'id',
        'mission_id',
        'project_id',
        'repository',
        'pull_request_number',
        'target_branch',
        'source_branch',
        'approved_base_sha',
        'approved_head_sha',
        'approved_diff_hash',
        'approval_proof_id',
        'approved_by',
        'approved_author_identity',
        'review_policy_hash',
        'proof_expires_at',
        'state',
        'failure_count',
      ].join(', '))
      .eq('mission_id', req.resourceId)
      .maybeSingle();

    if (intentError) {
      return result('retry', `Unable to read merge intent: ${intentError.message}`);
    }
    if (!rawIntent) {
      return result(
        'blocked',
        'Approved merge has no durable merge intent. FCR approval must fail closed until the projection exists.',
      );
    }

    const intent = rawIntent as unknown as MergeIntentRow;
    const previousState = intent.state;

    const { data: rawMission, error: missionError } = await supabase
      .from('missions')
      .select('id, project_id, status, branch_ref, base_ref, policy_snapshot')
      .eq('id', intent.mission_id)
      .maybeSingle();

    if (missionError) {
      return result('retry', `Unable to read merge-intent mission: ${missionError.message}`);
    }
    if (!rawMission) {
      await this.setState(intent, 'cancelled', 'mission no longer exists');
      return result('blocked', 'Merge intent cancelled because its mission no longer exists.', previousState, 'cancelled');
    }

    const mission = rawMission as unknown as MissionRow;
    if (mission.project_id !== intent.project_id || req.projectId !== intent.project_id) {
      await this.setState(intent, 'blocked', 'mission/project identity mismatch');
      return result('blocked', 'Merge intent project identity no longer matches its mission.', previousState, 'blocked');
    }

    if (mission.status === 'integrated') {
      await this.setState(intent, 'merged', null);
      return result('converged', 'Merge intent is integrated.', previousState, 'merged');
    }
    if (mission.status !== 'approved') {
      await this.setState(intent, 'cancelled', `mission status is ${mission.status}`);
      return result('blocked', `Merge intent cancelled because mission status is ${mission.status}.`, previousState, 'cancelled');
    }

    const proofExpiry = Date.parse(intent.proof_expires_at);
    if (!Number.isFinite(proofExpiry) || proofExpiry <= Date.now()) {
      await this.setState(intent, 'expired', 'founder merge proof expired before execution');
      return result('blocked', 'Merge intent proof lease expired; rerun the founder merge proof gate.', previousState, 'expired');
    }

    const { data: proof, error: proofError } = await supabase
      .from('proof_gate_results')
      .select('id, mission_id, gate_id, status, approved_by, ran_at')
      .eq('id', intent.approval_proof_id)
      .maybeSingle();

    if (proofError) {
      return result('retry', `Unable to reread merge approval proof: ${proofError.message}`);
    }
    if (
      !proof
      || proof.mission_id !== intent.mission_id
      || proof.gate_id !== 'merge'
      || proof.status !== 'pass'
      || lower(proof.approved_by) !== lower(intent.approved_by)
    ) {
      await this.setState(intent, 'blocked', 'approval proof identity/status no longer matches intent');
      return result('blocked', 'Merge intent approval proof no longer matches its durable projection.', previousState, 'blocked');
    }

    const snapshot = mission.policy_snapshot ?? {};
    const review = snapshot['independentReview'];
    const reviewRecord = review && typeof review === 'object' && !Array.isArray(review)
      ? review as Record<string, unknown>
      : {};
    const missionExpectedHead = lower(snapshot['expectedHeadSha']);
    const missionBase = lower(reviewRecord['baseSha']);
    const missionPolicyHash = lower(reviewRecord['policyHash']);
    const missionAuthor = lower(reviewRecord['authorIdentity']);
    const missionPr = Number(reviewRecord['pullRequestNumber']);

    if (
      missionExpectedHead !== lower(intent.approved_head_sha)
      || missionBase !== lower(intent.approved_base_sha)
      || missionPolicyHash !== lower(intent.review_policy_hash)
      || missionAuthor !== lower(intent.approved_author_identity)
      || missionPr !== intent.pull_request_number
      || mission.branch_ref !== intent.source_branch
      || (mission.base_ref || 'main') !== intent.target_branch
    ) {
      await this.setState(intent, 'blocked', 'mission policy snapshot drifted from approved intent');
      return result('blocked', 'Merge intent no longer matches the founder-pinned mission policy snapshot.', previousState, 'blocked');
    }

    if (
      lower(intent.repository) !== FCR_REPOSITORY
      || !FULL_SHA.test(intent.approved_base_sha)
      || !FULL_SHA.test(intent.approved_head_sha)
      || !SHA256.test(intent.review_policy_hash)
    ) {
      await this.setState(intent, 'blocked', 'merge intent immutable identity is malformed');
      return result('blocked', 'Merge intent immutable identity is malformed.', previousState, 'blocked');
    }

    const { data: rawProject, error: projectError } = await supabase
      .from('projects')
      .select('slug, repo_provider, repo_identifier')
      .eq('id', intent.project_id)
      .maybeSingle();

    if (projectError) {
      return result('retry', `Unable to read merge-intent project: ${projectError.message}`);
    }
    if (!rawProject) {
      await this.setState(intent, 'blocked', 'project no longer exists');
      return result('blocked', 'Merge intent project no longer exists.', previousState, 'blocked');
    }

    const project = rawProject as unknown as ProjectRow;
    if (lower(project.repo_identifier) !== lower(intent.repository)) {
      await this.setState(intent, 'blocked', 'repository identity changed after approval');
      return result('blocked', 'Merge intent repository identity changed after founder approval.', previousState, 'blocked');
    }

    let provider: RepositoryProvider;
    try {
      provider = configuredProvider(project);
    } catch (error) {
      await this.bumpBlocked(intent, 'repository provider unavailable');
      return result(
        'blocked',
        `Merge intent provider is unavailable: ${error instanceof Error ? error.message : String(error)}`,
        previousState,
        'blocked',
      );
    }

    if (typeof provider.getPullRequestReviewContext !== 'function') {
      await this.bumpBlocked(intent, 'provider cannot read exact pull request context');
      return result('blocked', 'Merge intent provider cannot read exact pull request context.', previousState, 'blocked');
    }

    let pullRequest;
    try {
      pullRequest = await provider.getPullRequestReviewContext(project.slug, intent.pull_request_number);
    } catch (error) {
      await this.bumpBlocked(intent, 'provider pull request context is unavailable');
      return result(
        'blocked',
        `Merge intent PR context is unavailable: ${error instanceof Error ? error.message : String(error)}`,
        previousState,
        'blocked',
      );
    }

    const currentBase = lower(pullRequest.baseSha);
    const currentHead = lower(pullRequest.headSha);

    if (
      lower(pullRequest.repository) !== lower(intent.repository)
      || lower(pullRequest.headRepository) !== lower(intent.repository)
      || pullRequest.number !== intent.pull_request_number
      || pullRequest.baseRef !== intent.target_branch
      || pullRequest.headRef !== intent.source_branch
      || lower(pullRequest.authorIdentity) !== lower(intent.approved_author_identity)
    ) {
      await this.setObservedState(intent, 'blocked', 'provider PR identity changed after approval', currentBase, currentHead, null);
      return result('blocked', 'Merge intent provider PR identity changed after founder approval.', previousState, 'blocked');
    }

    if (currentHead !== lower(intent.approved_head_sha)) {
      await this.setObservedState(intent, 'needs_review', 'candidate head changed after approval', currentBase, currentHead, null);
      return result('blocked', 'Merge candidate changed after approval and requires a new review/approval.', previousState, 'needs_review');
    }

    if (currentBase !== lower(intent.approved_base_sha)) {
      await this.setObservedState(intent, 'stale', 'target base moved after approval', currentBase, currentHead, null);
      return result('blocked', 'Merge target base moved; approved readiness is stale and must be revalidated.', previousState, 'stale');
    }

    let observedDiffHash: string;
    try {
      const diff = await provider.compare(project.slug, intent.approved_base_sha, intent.approved_head_sha);
      if (diff.behindBy !== 0 || diff.aheadBy < 1) {
        await this.setObservedState(
          intent,
          'blocked',
          `approved diff is not a merge candidate (ahead=${diff.aheadBy}, behind=${diff.behindBy})`,
          currentBase,
          currentHead,
          null,
        );
        return result('blocked', 'Approved base/head no longer form a valid merge candidate.', previousState, 'blocked');
      }
      observedDiffHash = independentReviewDiffHash(diff);
    } catch (error) {
      await this.bumpBlocked(intent, 'provider diff completeness could not be proven', currentBase, currentHead);
      return result(
        'blocked',
        `Merge intent diff could not be proven complete: ${error instanceof Error ? error.message : String(error)}`,
        previousState,
        'blocked',
      );
    }

    if (intent.approved_diff_hash && lower(intent.approved_diff_hash) !== lower(observedDiffHash)) {
      await this.setObservedState(
        intent,
        'needs_review',
        'canonical provider diff hash changed for the approved candidate pair',
        currentBase,
        currentHead,
        observedDiffHash,
      );
      return result('blocked', 'Canonical provider diff no longer matches the approved candidate witness.', previousState, 'needs_review');
    }

    const { error: readyError } = await supabase
      .from('merge_intents')
      .update({
        state: 'ready',
        approved_diff_hash: intent.approved_diff_hash ?? observedDiffHash,
        last_observed_base_sha: currentBase,
        last_observed_head_sha: currentHead,
        last_observed_diff_hash: observedDiffHash,
        stale_reason: null,
        last_reconciled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', intent.id);

    if (readyError) {
      return result('retry', `Unable to persist merge-intent readiness: ${readyError.message}`);
    }

    return result(
      'converged',
      'Merge intent identity is fresh. READY is a liveness projection only; guarded /execute remains merge authority.',
      previousState,
      'ready',
    );
  }

  private async setState(intent: MergeIntentRow, state: MergeIntentState, reason: string | null): Promise<void> {
    const { error } = await supabase
      .from('merge_intents')
      .update({
        state,
        stale_reason: reason,
        last_reconciled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', intent.id);
    if (error) throw new Error(`Unable to persist merge-intent ${state}: ${error.message}`);
  }

  private async setObservedState(
    intent: MergeIntentRow,
    state: MergeIntentState,
    reason: string,
    baseSha: string | null,
    headSha: string | null,
    diffHash: string | null,
  ): Promise<void> {
    const { error } = await supabase
      .from('merge_intents')
      .update({
        state,
        stale_reason: reason,
        last_observed_base_sha: FULL_SHA.test(baseSha ?? '') ? baseSha : null,
        last_observed_head_sha: FULL_SHA.test(headSha ?? '') ? headSha : null,
        last_observed_diff_hash: SHA256.test(diffHash ?? '') ? diffHash : null,
        last_reconciled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', intent.id);
    if (error) throw new Error(`Unable to persist merge-intent ${state}: ${error.message}`);
  }

  private async bumpBlocked(
    intent: MergeIntentRow,
    reason: string,
    baseSha: string | null = null,
    headSha: string | null = null,
  ): Promise<void> {
    const { error } = await supabase
      .from('merge_intents')
      .update({
        state: 'blocked',
        stale_reason: reason,
        last_observed_base_sha: FULL_SHA.test(baseSha ?? '') ? baseSha : null,
        last_observed_head_sha: FULL_SHA.test(headSha ?? '') ? headSha : null,
        failure_count: Math.max(0, intent.failure_count) + 1,
        last_reconciled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', intent.id);
    if (error) throw new Error(`Unable to persist merge-intent blocked state: ${error.message}`);
  }
}
