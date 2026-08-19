import { BaseController } from './base.js';
import { supabase } from '../lib/supabaseClient.js';
import {
  providerConfigurationError,
  providerForProject,
  type ProviderProjectConfig,
} from '../providers/providerFactory.js';
import { independentReviewDiffHash } from '../review/independentReviewGate.js';
import type { ReconcileRequest, ReconcileResult } from '../reconciliation/types.js';
import type {
  PullRequestReviewContext,
  RepositoryProvider,
} from '../providers/RepositoryProvider.js';

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
  revision: number;
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
  intent?: MergeIntentRow,
  nextState?: MergeIntentState,
): ReconcileResult {
  return {
    status,
    observedChanges: intent && nextState && intent.state !== nextState
      ? [{
          resourceType: 'merge_intent',
          resourceId: intent.id,
          field: 'state',
          previousValue: intent.state,
          newValue: nextState,
        }]
      : [],
    proposedActions: [],
    evidenceIds: [],
    requiresApproval: false,
    message,
  };
}

function concurrentAdvance(intent: MergeIntentRow): ReconcileResult {
  return result(
    'retry',
    `Merge intent revision/state advanced while reconciliation was running (revision=${intent.revision}, state=${intent.state}); reread before classifying.`,
  );
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
        'revision',
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
    if (!Number.isInteger(intent.revision) || intent.revision <= 0) {
      return result('blocked', 'Merge intent approval revision is malformed.', intent, 'blocked');
    }

    // Execution and completion are owned by approval_executions / mission
    // lifecycle triggers. Reconciliation must never pull them backward to READY.
    if (intent.state === 'merged') {
      return result('converged', 'Merge intent is already merged.', intent, 'merged');
    }
    if (intent.state === 'executing') {
      return result('converged', 'Guarded merge execution is already in progress.', intent, 'executing');
    }

    const { data: rawMission, error: missionError } = await supabase
      .from('missions')
      .select('id, project_id, status, branch_ref, base_ref, policy_snapshot')
      .eq('id', intent.mission_id)
      .maybeSingle();

    if (missionError) {
      return result('retry', `Unable to read merge-intent mission: ${missionError.message}`);
    }
    if (!rawMission) {
      return this.transition(
        intent,
        { state: 'cancelled', stale_reason: 'mission no longer exists' },
        'blocked',
        'Merge intent cancelled because its mission no longer exists.',
        'cancelled',
      );
    }

    const mission = rawMission as unknown as MissionRow;
    if (mission.project_id !== intent.project_id || req.projectId !== intent.project_id) {
      return this.transition(
        intent,
        { state: 'blocked', stale_reason: 'mission/project identity mismatch' },
        'blocked',
        'Merge intent project identity no longer matches its mission.',
        'blocked',
      );
    }

    if (mission.status === 'integrated') {
      return this.transition(
        intent,
        { state: 'merged', stale_reason: null },
        'converged',
        'Merge intent is integrated.',
        'merged',
      );
    }
    if (mission.status !== 'approved') {
      return this.transition(
        intent,
        { state: 'cancelled', stale_reason: `mission status is ${mission.status}` },
        'blocked',
        `Merge intent cancelled because mission status is ${mission.status}.`,
        'cancelled',
      );
    }

    // These states require an explicit new approval revision. In particular,
    // force-resetting a branch back to the old SHA must not resurrect approval
    // after we already observed candidate drift.
    if (intent.state === 'needs_review') {
      return result('blocked', 'Candidate drift was observed; a new founder review/approval revision is required.', intent, 'needs_review');
    }
    if (intent.state === 'stale') {
      return result('blocked', 'Base drift was observed; a new revalidation/approval revision is required.', intent, 'stale');
    }
    if (intent.state === 'expired') {
      return result('blocked', 'Founder merge proof expired; rerun the proof gate to create a new approval revision.', intent, 'expired');
    }
    if (intent.state === 'cancelled') {
      return result('blocked', 'Merge intent is cancelled; explicit reapproval is required.', intent, 'cancelled');
    }

    const proofExpiry = Date.parse(intent.proof_expires_at);
    if (!Number.isFinite(proofExpiry) || proofExpiry <= Date.now()) {
      return this.transition(
        intent,
        { state: 'expired', stale_reason: 'founder merge proof expired before execution' },
        'blocked',
        'Merge intent proof lease expired; rerun the founder merge proof gate.',
        'expired',
      );
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
      return this.transition(
        intent,
        { state: 'blocked', stale_reason: 'approval proof identity/status no longer matches intent' },
        'blocked',
        'Merge intent approval proof no longer matches its durable projection.',
        'blocked',
      );
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
      return this.transition(
        intent,
        { state: 'blocked', stale_reason: 'mission policy snapshot drifted from approved intent' },
        'blocked',
        'Merge intent no longer matches the founder-pinned mission policy snapshot.',
        'blocked',
      );
    }

    if (
      lower(intent.repository) !== FCR_REPOSITORY
      || !FULL_SHA.test(intent.approved_base_sha)
      || !FULL_SHA.test(intent.approved_head_sha)
      || !SHA256.test(intent.review_policy_hash)
    ) {
      return this.transition(
        intent,
        { state: 'blocked', stale_reason: 'merge intent immutable identity is malformed' },
        'blocked',
        'Merge intent immutable identity is malformed.',
        'blocked',
      );
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
      return this.transition(
        intent,
        { state: 'blocked', stale_reason: 'project no longer exists' },
        'blocked',
        'Merge intent project no longer exists.',
        'blocked',
      );
    }

    const project = rawProject as unknown as ProjectRow;
    if (lower(project.repo_identifier) !== lower(intent.repository)) {
      return this.transition(
        intent,
        { state: 'blocked', stale_reason: 'repository identity changed after approval' },
        'blocked',
        'Merge intent repository identity changed after founder approval.',
        'blocked',
      );
    }

    let provider: RepositoryProvider;
    try {
      provider = configuredProvider(project);
    } catch (error) {
      return this.blockWithFailure(
        intent,
        'repository provider unavailable',
        `Merge intent provider is unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    if (typeof provider.getPullRequestReviewContext !== 'function') {
      return this.blockWithFailure(
        intent,
        'provider cannot read exact pull request context',
        'Merge intent provider cannot read exact pull request context.',
      );
    }

    let pullRequest: PullRequestReviewContext;
    try {
      pullRequest = await provider.getPullRequestReviewContext(project.slug, intent.pull_request_number);
    } catch (error) {
      return this.blockWithFailure(
        intent,
        'provider pull request context is unavailable',
        `Merge intent PR context is unavailable: ${error instanceof Error ? error.message : String(error)}`,
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
      return this.transition(
        intent,
        {
          state: 'blocked',
          stale_reason: 'provider PR identity changed after approval',
          last_observed_base_sha: FULL_SHA.test(currentBase) ? currentBase : null,
          last_observed_head_sha: FULL_SHA.test(currentHead) ? currentHead : null,
          last_observed_diff_hash: null,
        },
        'blocked',
        'Merge intent provider PR identity changed after founder approval.',
        'blocked',
      );
    }

    if (currentHead !== lower(intent.approved_head_sha)) {
      return this.transition(
        intent,
        {
          state: 'needs_review',
          stale_reason: 'candidate head changed after approval',
          last_observed_base_sha: FULL_SHA.test(currentBase) ? currentBase : null,
          last_observed_head_sha: FULL_SHA.test(currentHead) ? currentHead : null,
          last_observed_diff_hash: null,
        },
        'blocked',
        'Merge candidate changed after approval and requires a new review/approval.',
        'needs_review',
      );
    }

    if (currentBase !== lower(intent.approved_base_sha)) {
      return this.transition(
        intent,
        {
          state: 'stale',
          stale_reason: 'target base moved after approval',
          last_observed_base_sha: FULL_SHA.test(currentBase) ? currentBase : null,
          last_observed_head_sha: FULL_SHA.test(currentHead) ? currentHead : null,
          last_observed_diff_hash: null,
        },
        'blocked',
        'Merge target base moved; approved readiness is stale and requires a new revalidation/approval revision.',
        'stale',
      );
    }

    let observedDiffHash: string;
    try {
      const diff = await provider.compare(project.slug, intent.approved_base_sha, intent.approved_head_sha);
      if (diff.behindBy !== 0 || diff.aheadBy < 1) {
        return this.transition(
          intent,
          {
            state: 'blocked',
            stale_reason: `approved diff is not a merge candidate (ahead=${diff.aheadBy}, behind=${diff.behindBy})`,
            last_observed_base_sha: currentBase,
            last_observed_head_sha: currentHead,
            last_observed_diff_hash: null,
          },
          'blocked',
          'Approved base/head no longer form a valid merge candidate.',
          'blocked',
        );
      }
      observedDiffHash = independentReviewDiffHash(diff);
    } catch (error) {
      return this.blockWithFailure(
        intent,
        'provider diff completeness could not be proven',
        `Merge intent diff could not be proven complete: ${error instanceof Error ? error.message : String(error)}`,
        currentBase,
        currentHead,
      );
    }

    if (intent.approved_diff_hash && lower(intent.approved_diff_hash) !== lower(observedDiffHash)) {
      return this.transition(
        intent,
        {
          state: 'needs_review',
          stale_reason: 'canonical provider diff hash changed for the approved candidate pair',
          last_observed_base_sha: currentBase,
          last_observed_head_sha: currentHead,
          last_observed_diff_hash: observedDiffHash,
        },
        'blocked',
        'Canonical provider diff no longer matches the approved candidate witness.',
        'needs_review',
      );
    }

    return this.transition(
      intent,
      {
        state: 'ready',
        approved_diff_hash: intent.approved_diff_hash ?? observedDiffHash,
        last_observed_base_sha: currentBase,
        last_observed_head_sha: currentHead,
        last_observed_diff_hash: observedDiffHash,
        stale_reason: null,
      },
      'converged',
      'Merge intent identity is fresh. READY is a liveness projection only; guarded /execute remains merge authority.',
      'ready',
    );
  }

  private async transition(
    intent: MergeIntentRow,
    patch: Record<string, unknown>,
    status: ReconcileResult['status'],
    message: string,
    nextState: MergeIntentState,
  ): Promise<ReconcileResult> {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('merge_intents')
      .update({
        ...patch,
        last_reconciled_at: now,
        updated_at: now,
      })
      .eq('id', intent.id)
      .eq('revision', intent.revision)
      .eq('state', intent.state)
      .select('id')
      .maybeSingle();

    if (error) {
      return result('retry', `Unable to persist merge-intent ${nextState}: ${error.message}`);
    }
    if (!data) return concurrentAdvance(intent);
    return result(status, message, intent, nextState);
  }

  private async blockWithFailure(
    intent: MergeIntentRow,
    reason: string,
    message: string,
    baseSha: string | null = null,
    headSha: string | null = null,
  ): Promise<ReconcileResult> {
    return this.transition(
      intent,
      {
        state: 'blocked',
        stale_reason: reason,
        last_observed_base_sha: FULL_SHA.test(baseSha ?? '') ? baseSha : null,
        last_observed_head_sha: FULL_SHA.test(headSha ?? '') ? headSha : null,
        failure_count: Math.max(0, intent.failure_count) + 1,
      },
      'blocked',
      message,
      'blocked',
    );
  }
}
