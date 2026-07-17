/**
 * ReleaseController
 *
 * Observation-only. Triggered exclusively by GitHub deployment and
 * deployment_status webhook events.
 *
 * Persists normalized deployment state into releases.
 * On deployment success: stores evidence + advances an integrated mission to deployed.
 * On deployment failure: stores failing evidence and leaves mission integrated so
 * rollback or retry remains an explicit founder decision.
 *
 * Does NOT trigger, approve, or record intent for deployments.
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
  const normalized = state.toLowerCase();
  if (normalized === 'success') return 'success';
  if (normalized === 'failure' || normalized === 'error') return 'failure';
  if (normalized === 'in_progress') return 'in_progress';
  if (normalized === 'queued') return 'queued';
  if (normalized === 'inactive') return 'inactive';
  return 'pending';
}

export class ReleaseController extends BaseController {
  readonly name = 'ReleaseController';

  protected async reconcile(req: ReconcileRequest): Promise<ReconcileResult> {
    const { projectId, resourceId, sourceEventId } = req;

    if (!resourceId) return this.done('converged', 'No resourceId');
    if (!sourceEventId) {
      return this.done(
        'converged',
        'No sourceEventId — ReleaseController requires an observed deployment event',
      );
    }

    const { data: event } = await supabase
      .from('provider_events')
      .select('payload, event_type')
      .eq('id', sourceEventId)
      .single();

    if (!event) return this.done('retry', `Provider event ${sourceEventId} not found`);

    const payload = event.payload as Record<string, unknown>;
    const eventType = event.event_type as string;

    let deploymentId: string | null = null;
    let commitSha: string | null = null;
    let environment: string | null = null;
    let state: DeploymentState = 'pending';
    let deployUrl: string | null = null;
    let providerUpdatedAt = new Date().toISOString();

    if (eventType === 'deployment_status') {
      const deploymentStatus = payload['deployment_status'] as Record<string, unknown>;
      const deployment = payload['deployment'] as Record<string, unknown>;
      deploymentId = String(deployment?.['id'] ?? resourceId);
      commitSha = (deployment?.['sha'] as string) ?? null;
      environment = (deployment?.['environment'] as string) ?? null;
      state = mapDeployState((deploymentStatus?.['state'] as string) ?? 'pending');
      deployUrl = (deploymentStatus?.['environment_url'] as string) ?? null;
      providerUpdatedAt = (deploymentStatus?.['updated_at'] as string) ?? providerUpdatedAt;
    } else if (eventType === 'deployment') {
      const deployment = payload['deployment'] as Record<string, unknown>;
      deploymentId = String(deployment?.['id'] ?? resourceId);
      commitSha = (deployment?.['sha'] as string) ?? null;
      environment = (deployment?.['environment'] as string) ?? null;
      state = 'pending';
      providerUpdatedAt = (deployment?.['created_at'] as string) ?? providerUpdatedAt;
    } else {
      return this.done('converged', `Unhandled event type: ${eventType}`);
    }

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
      return this.done('retry', upsertError.message);
    }

    const { data: mission } = await supabase
      .from('missions')
      .select('id, status')
      .eq('project_id', projectId)
      .in('status', ['integrated', 'deployed'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const evidenceIds: string[] = [];

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

      if (mission && state === 'success' && mission.status === 'integrated') {
        await supabase
          .from('missions')
          .update({ status: 'deployed', updated_at: new Date().toISOString() })
          .eq('id', mission.id)
          .eq('status', 'integrated');
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
    }

    return {
      status: 'converged',
      observedChanges: [{
        resourceType: 'release',
        resourceId: deploymentId ?? resourceId,
        field: 'state',
        previousValue: null,
        newValue: state,
      }],
      proposedActions: [],
      evidenceIds,
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
