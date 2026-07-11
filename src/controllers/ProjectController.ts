/**
 * ProjectController
 *
 * Refreshes normalized project observed state from GitHub:
 * - open PRs
 * - default branch SHA
 * - recent check run summary
 *
 * Persists result to provider_observations.
 * Used by both event-triggered and periodic safety resync paths.
 */

import { supabase } from '../lib/supabaseClient.js';
import { BaseController } from './base.js';
import type { ReconcileRequest, ReconcileResult } from '../reconciliation/types.js';

export class ProjectController extends BaseController {
  readonly name = 'ProjectController';

  protected async reconcile(req: ReconcileRequest): Promise<ReconcileResult> {
    const { projectId } = req;

    // Load project's GitHub connection
    const { data: project } = await supabase
      .from('projects')
      .select('id, slug, name')
      .eq('id', projectId)
      .single();

    if (!project) {
      return this.done('retry', `Project ${projectId} not found`);
    }

    const { data: connection } = await supabase
      .from('project_connections')
      .select('provider, connection_config, status')
      .eq('project_id', projectId)
      .eq('provider', 'github')
      .eq('status', 'active')
      .single();

    if (!connection) {
      return this.done('converged', 'No active GitHub connection for project');
    }

    const config = connection.connection_config as Record<string, unknown>;
    const repoFullName = config['repository'] as string | undefined;

    if (!repoFullName) {
      return this.done('converged', 'No repository configured in connection');
    }

    // Fetch current default branch state from GitHub via stored provider token
    // (Token resolution is deferred to the provider adapter layer – stub here)
    const observedState = {
      repository: repoFullName,
      observedAt: new Date().toISOString(),
      source: 'project_controller_resync',
      // Real GitHub API calls will be added when GitHubProvider adapter is wired
    };

    // Upsert observed state
    await supabase
      .from('provider_observations')
      .upsert(
        {
          project_id: projectId,
          provider: 'github',
          resource_type: 'repository',
          resource_id: repoFullName,
          observed_state: observedState,
          observed_at: new Date().toISOString(),
          source_event_id: req.sourceEventId ?? null,
        },
        { onConflict: 'project_id,provider,resource_type,resource_id' },
      );

    this.log('info', 'Project observation refreshed', { projectId, repo: repoFullName });

    return {
      status: 'converged',
      observedChanges: [],
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
    };
  }
}
