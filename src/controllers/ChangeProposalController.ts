/**
 * ChangeProposalController
 *
 * Triggered by GitHub pull_request events.
 * Persists normalized PR state into change_proposals.
 * On merge: enqueues ReleaseController.
 * On any update: enqueues MissionController with dependency_changed.
 */

import { supabase } from '../lib/supabaseClient.js';
import { BaseController } from './base.js';
import { enqueueReconcile } from '../events/outbox.js';
import type { ReconcileRequest, ReconcileResult } from '../reconciliation/types.js';

type PRAction =
  | 'opened'
  | 'synchronize'
  | 'reopened'
  | 'closed'
  | 'ready_for_review'
  | string;

interface NormalizedPR {
  number: number;
  title: string;
  headSha: string;
  headBranch: string;
  baseBranch: string;
  state: string;
  merged: boolean;
  mergeCommitSha: string | null;
  action: PRAction;
  htmlUrl: string;
  authorLogin: string;
  updatedAt: string;
}

function normalizePR(
  payload: Record<string, unknown>,
): NormalizedPR | null {
  const pr = payload['pull_request'] as Record<string, unknown> | undefined;
  if (!pr) return null;

  const head = pr['head'] as Record<string, unknown>;
  const base = pr['base'] as Record<string, unknown>;
  const user = pr['user'] as Record<string, unknown>;

  return {
    number: pr['number'] as number,
    title: (pr['title'] as string) ?? '',
    headSha: (head?.['sha'] as string) ?? '',
    headBranch: (head?.['ref'] as string) ?? '',
    baseBranch: (base?.['ref'] as string) ?? '',
    state: (pr['state'] as string) ?? 'open',
    merged: Boolean(pr['merged']),
    mergeCommitSha: (pr['merge_commit_sha'] as string | null) ?? null,
    action: (payload['action'] as PRAction) ?? 'synchronize',
    htmlUrl: (pr['html_url'] as string) ?? '',
    authorLogin: (user?.['login'] as string) ?? '',
    updatedAt: (pr['updated_at'] as string) ?? new Date().toISOString(),
  };
}

export class ChangeProposalController extends BaseController {
  readonly name = 'ChangeProposalController';

  protected async reconcile(req: ReconcileRequest): Promise<ReconcileResult> {
    const { projectId, resourceId: prNumber, sourceEventId } = req;

    if (!prNumber) return this.done('converged', 'No PR number');
    if (!sourceEventId) return this.done('converged', 'No sourceEventId — cannot read payload');

    const { data: event } = await supabase
      .from('provider_events')
      .select('payload')
      .eq('id', sourceEventId)
      .single();

    if (!event) return this.done('retry', `Event ${sourceEventId} not found`);

    const pr = normalizePR(event.payload as Record<string, unknown>);
    if (!pr) return this.done('converged', 'No pull_request in payload');

    const proposalStatus = pr.merged
      ? 'merged'
      : pr.state === 'closed'
        ? 'closed'
        : 'open';

    const { error: upsertError } = await supabase
      .from('change_proposals')
      .upsert(
        {
          project_id: projectId,
          provider: 'github',
          provider_pr_number: pr.number,
          title: pr.title,
          head_sha: pr.headSha,
          head_branch: pr.headBranch,
          base_branch: pr.baseBranch,
          status: proposalStatus,
          merged: pr.merged,
          merge_commit_sha: pr.mergeCommitSha,
          html_url: pr.htmlUrl,
          author_login: pr.authorLogin,
          provider_updated_at: pr.updatedAt,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: 'project_id,provider,provider_pr_number' },
      );

    if (upsertError) {
      this.log('error', 'Failed to upsert change_proposal', { error: upsertError.message });
      return this.done('retry', upsertError.message);
    }

    this.log('info', 'Change proposal updated', {
      projectId,
      prNumber: pr.number,
      status: proposalStatus,
      action: pr.action,
    });

    const { data: mission } = await supabase
      .from('missions')
      .select('id, status')
      .eq('project_id', projectId)
      .in('status', ['implementing', 'preview_ready', 'awaiting_approval', 'deploying'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (pr.merged && pr.mergeCommitSha) {
      await enqueueReconcile(
        {
          projectId,
          controller: 'ReleaseController',
          resourceId: pr.mergeCommitSha,
          reason: 'provider_event',
          sourceEventId,
        },
        { availableAt: new Date(Date.now() + 1_000).toISOString() },
      );
    }

    if (mission) {
      await enqueueReconcile(
        {
          projectId,
          controller: 'MissionController',
          resourceId: mission.id,
          reason: 'dependency_changed',
          sourceEventId,
        },
        { availableAt: new Date(Date.now() + 1_000).toISOString() },
      );
    }

    return {
      status: 'converged',
      observedChanges: [{
        resourceType: 'change_proposal',
        resourceId: String(pr.number),
        field: 'status',
        previousValue: null,
        newValue: proposalStatus,
      }],
      proposedActions: [],
      evidenceIds: [],
      requiresApproval: false,
    };
  }

  private done(status: ReconcileResult['status'], message: string): ReconcileResult {
    return {
      status,
      observedChanges: [],
      proposedActions: [],
      evidenceIds: [],
      requiresApproval: false,
      message,
      ...(status === 'retry' ? { retryAfter: new Date(Date.now() + 10_000).toISOString() } : {}),
    };
  }
}
