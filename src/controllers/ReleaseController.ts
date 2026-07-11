/**
 * ReleaseController — OBSERVATION ONLY
 *
 * Triggered by GitHub deployment / deployment_status events.
 * Also triggered by ChangeProposalController when a PR merges
 * (commit-SHA path — records that a merge happened, not that a
 * deployment was initiated by the Control Room).
 *
 * This controller NEVER triggers or executes a deployment.
 * Deployment execution is explicitly out of scope for Milestone B.
 * Any path that previously recorded "deploy intent" has been removed.
 *
 * What it does:
 *   - Ingests GitHub deployment / deployment_status events
 *   - Normalizes and upserts a releases row
 *   - Stores deployment ID, commit SHA, environment, URL, and state
 *   - Writes evidence on terminal states (success / failure)
 *   - Advances mission to 'verifying' on success, 'failed' on failure
 *   - Enqueues MissionController to re-evaluate
 *
 * Merged-PR path (commit SHA, no sourceEventId):
 *   Records that a merge happened with state='pending'.
 *   No deployment ID is available yet. ReleaseController will be
 *   triggered again when GitHub emits a real deployment event.
 */

import { supabase } from '../lib/supabaseClient.js';
import { BaseController } from './base.js';
import { enqueueReconcile } from '../events/outbox.js';
import type {
  ReconcileRequest,
  ReconcileResult,
  EvidenceRecord,
} from '../reconciliation/types.js';

type DeploymentState =
  | 'pending'
  | 'queued'
  | 'in_progress'
  | 'success'
  | 'failure'
  | 'error'
  | 'inactive';

function mapDeployState(state: string): DeploymentState {
  const s = state.toLowerCase();
  if (s === 'success') return 'success';
  if (s === 'failure' || s === 'error') return 'failure';
  if (s === 'in_progress') return 'in_progress';
  if (s === 'queued') return 'queued';
  if (s === 'inactive') return 'inactive';
  return 'pending';
}

export class ReleaseController extends BaseController {
  readonly name = 'ReleaseController';

  protected async reconcile(req: ReconcileRequest): Promise<ReconcileResult> {
    const { projectId, resourceId, sourceEventId } = req;

    if (!resourceId) return this.skip('No resourceId');

    let deploymentId: string | null = null;
    let commitSha: string | null = null;
    let environment: string | null = null;
    let state: DeploymentState = 'pending';
    let deployUrl: string | null = null;
    let providerUpdatedAt: string = new Date().toISOString();

    if (sourceEventId) {
      // -----------------------------------------------------------------------
      // Deployment / deployment_status event path
      // resourceId is the GitHub deployment ID
      // -----------------------------------------------------------------------
      const { data: event } = await supabase
        .from('provider_events')
        .select('payload, event_type')
        .eq('id', sourceEventId)
        .single();

      if (!event) return this.retry(`Event ${sourceEventId} not found`);

      const payload = event.payload as Record<string, unknown>;
      const eventType = event.event_type as string;

      if (eventType === 'deployment_status') {
        const ds = payload['deployment_status'] as Record<string, unknown>;
        const dep = payload['deployment'] as Record<string, unknown>;
        deploymentId = String(dep?.['id'] ?? resourceId);
        commitSha = (dep?.['sha'] as string) ?? null;
        environment = (dep?.['environment'] as string) ?? null;
        state = mapDeployState((ds?.['state'] as string) ?? 'pending');
        deployUrl = (ds?.['environment_url'] as string) ?? null;
        providerUpdatedAt = (ds?.['updated_at'] as string) ?? providerUpdatedAt;
      } else if (eventType === 'deployment') {
        const dep = payload['deployment'] as Record<string, unknown>;
        deploymentId = String(dep?.['id'] ?? resourceId);
        commitSha = (dep?.['sha'] as string) ?? null;
        environment = (dep?.['environment'] as string) ?? null;
        state = 'pending';
        providerUpdatedAt = (dep?.['created_at'] as string) ?? providerUpdatedAt;
      } else {
        // Unexpected event type routed here — log and skip
        this.log('warn', 'ReleaseController received unexpected event type', { eventType });
        return this.skip(`Unexpected event type for ReleaseController: ${eventType}`);
      }
    } else {
      // -----------------------------------------------------------------------
      // Merged-PR path (triggered by ChangeProposalController)
      // resourceId is the merge commit SHA.
      // We record that a merge happened. State is 'pending' because no
      // deployment event has arrived yet — this is observation only.
      // -----------------------------------------------------------------------
      commitSha = resourceId;
      state = 'pending';
      // No deploymentId yet. The releases_dedup constraint is on
      // (project_id, provider, provider_deployment_id) — NULL deployment IDs
      // are not unique, so each merge stub gets its own row.
    }

    // -----------------------------------------------------------------------
    // Upsert release record
    // -----------------------------------------------------------------------
    const { error: upsertError } = await supabase
      .from('releases')
      .upsert(
        {
          project_id: projectId,
          provider: 'github',
          provider_deployment_id: deploymentId,
          commit_sha: commitSha,
          environment: environment ?? 'production',
          state,
          deploy_url: deployUrl,
          provider_updated_at: providerUpdatedAt,
          observed_at: new Date().toISOString(),
        },
        {
          onConflict: 'project_id,provider,provider_deployment_id',
          ignoreDuplicates: false,
        },
      );

    if (upsertError) {
      this.log('error', 'Failed to upsert release', { error: upsertError.message });
      return this.retry(upsertError.message);
    }

    this.log('info', 'Release observed', { projectId, state, environment, commitSha, deploymentId });

    // Find active mission (deploying or verifying)
    const { data: mission } = await supabase
      .from('missions')
      .select('id, status')
      .eq('project_id', projectId)
      .in('status', ['deploying', 'verifying'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const evidenceIds: string[] = [];

    // -----------------------------------------------------------------------
    // Terminal states: write evidence and advance mission
    // -----------------------------------------------------------------------
    if (state === 'success' || state === 'failure') {
      const evidenceRecord: EvidenceRecord = {
        projectId,
        missionId: mission?.id,
        subject: `deployment:${environment ?? 'production'}`,
        kind: 'deployment_result',
        status: state === 'success' ? 'pass' : 'fail',
        provider: 'github',
        commitSha: commitSha ?? undefined,
        environment: environment ?? 'production',
        detailsRef: deployUrl ?? undefined,
      };

      const { data: inserted } = await supabase
        .from('evidence')
        .insert({
          project_id: evidenceRecord.projectId,
          mission_id: evidenceRecord.missionId ?? null,
          subject: evidenceRecord.subject,
          kind: evidenceRecord.kind,
          status: evidenceRecord.status,
          provider: evidenceRecord.provider,
          commit_sha: evidenceRecord.commitSha ?? null,
          environment: evidenceRecord.environment ?? null,
          details_ref: evidenceRecord.detailsRef ?? null,
        })
        .select('id')
        .single();

      if (inserted) evidenceIds.push(inserted.id);

      if (mission) {
        const nextMissionStatus = state === 'success' ? 'verifying' : 'failed';
        await supabase
          .from('missions')
          .update({ status: nextMissionStatus, updated_at: new Date().toISOString() })
          .eq('id', mission.id)
          .eq('status', mission.status);

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
    }

    return {
      status: 'converged',
      observedChanges: [{
        resourceType: 'release',
        resourceId: deploymentId ?? commitSha ?? resourceId,
        field: 'state',
        previousValue: null,
        newValue: state,
      }],
      proposedActions: [],
      evidenceIds,
      requiresApproval: false,
    };
  }

  private skip(message: string): ReconcileResult {
    return { status: 'converged', observedChanges: [], proposedActions: [], evidenceIds: [], requiresApproval: false, message };
  }

  private retry(message: string): ReconcileResult {
    return { status: 'retry', observedChanges: [], proposedActions: [], evidenceIds: [], requiresApproval: false, message, retryAfter: new Date(Date.now() + 10_000).toISOString() };
  }
}
