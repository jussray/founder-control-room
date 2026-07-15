/**
 * ProjectController
 *
 * Refreshes normalized, read-only repository state through RepositoryProvider.
 * Both event-triggered and periodic safety resync paths use this controller.
 */

import { supabase } from '../lib/supabaseClient.js';
import { createRepositoryProvider, normalizeRepositoryConnection } from '../providers/RepositoryProviderFactory.js';
import { BaseController } from './base.js';
import type { ReconcileRequest, ReconcileResult } from '../reconciliation/types.js';

export class ProjectController extends BaseController {
  readonly name = 'ProjectController';

  protected async reconcile(req: ReconcileRequest): Promise<ReconcileResult> {
    const { projectId } = req;

    const { data: project } = await supabase
      .from('projects')
      .select('id, slug, name, repo_provider, repo_identifier')
      .eq('id', projectId)
      .single();

    if (!project) return this.done('retry', `Project ${projectId} not found`);

    const { data: connection } = await supabase
      .from('project_connections')
      .select('provider, connection_config, status')
      .eq('project_id', projectId)
      .eq('status', 'active')
      .maybeSingle();

    try {
      const input = {
        slug: project.slug,
        repoProvider: project.repo_provider,
        repoIdentifier: project.repo_identifier,
        provider: connection?.provider,
        connectionConfig: connection?.connection_config as Record<string, unknown> | null,
      };
      const normalized = normalizeRepositoryConnection(input);
      const provider = createRepositoryProvider(input);
      const liveProject = await provider.getProject(project.slug);
      const rootEntries = await provider.listFiles(
        project.slug,
        liveProject.defaultBranch,
      );
      const rootFileNames = rootEntries.map((entry) => entry.path).sort();
      const manifestCandidates = [
        'README.md',
        'package.json',
        'pyproject.toml',
        'requirements.txt',
        'Cargo.toml',
        'AGENTS.md',
        'CLAUDE.md',
      ].filter((path) => rootFileNames.includes(path));

      const observedAt = new Date().toISOString();
      const observedState = {
        repository: normalized.repository,
        provider: normalized.provider,
        defaultBranch: liveProject.defaultBranch,
        active: liveProject.isActive,
        rootEntryCount: rootEntries.length,
        rootFiles: rootFileNames.slice(0, 200),
        manifests: manifestCandidates,
        observedAt,
        source: 'project_controller_repository_provider',
      };

      const { data: observation, error: observationError } = await supabase
        .from('provider_observations')
        .upsert(
          {
            project_id: projectId,
            provider: normalized.provider,
            resource_type: 'repository',
            resource_id: normalized.repository,
            observed_state: observedState,
            observed_at: observedAt,
            source_event_id: req.sourceEventId ?? null,
          },
          { onConflict: 'project_id,provider,resource_type,resource_id' },
        )
        .select('id')
        .single();

      if (observationError) throw new Error(observationError.message);

      this.log('info', 'Project observation refreshed', {
        projectId,
        repo: normalized.repository,
        rootEntries: rootEntries.length,
      });

      return {
        status: 'converged',
        observedChanges: [{
          resourceType: 'repository',
          resourceId: normalized.repository,
          change: 'observation_refreshed',
        }],
        proposedActions: [],
        evidenceIds: observation?.id ? [observation.id] : [],
        requiresApproval: false,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log('warning', 'Project observation failed', { projectId, message });
      return this.done('retry', message);
    }
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
