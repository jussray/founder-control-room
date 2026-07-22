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

    try {
      // `projects.repo_provider` + `projects.repo_identifier` are the canonical
      // Phase 1 repository locator. `project_connections` remains the generic
      // plugin-slot table and its initial schema is connection_type/config,
      // not provider/connection_config.
      const input = {
        slug: project.slug,
        repoProvider: project.repo_provider,
        repoIdentifier: project.repo_identifier,
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
          field: 'observed_state',
          previousValue: null,
          newValue: observedState,
        }],
        proposedActions: [],
        evidenceIds: observation?.id ? [observation.id] : [],
        requiresApproval: false,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log('warn', 'Project observation failed', { projectId, message });
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
