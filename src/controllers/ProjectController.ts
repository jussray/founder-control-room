/**
 * ProjectController
 *
 * Refreshes exact repository identity, default branch SHA, and latest provider
 * verification signals. It reads the canonical project registry directly and
 * never depends on stale connection-column names.
 */

import { supabase } from "../lib/supabaseClient.js";
import { providerForProject } from "../providers/providerFactory.js";
import type { ReconcileRequest, ReconcileResult } from "../reconciliation/types.js";
import { BaseController } from "./base.js";

interface ProjectRow {
  id: string;
  slug: string;
  name: string;
  repo_provider: string;
  repo_identifier: string | null;
  status: "active" | "paused" | "archived";
}

export class ProjectController extends BaseController {
  readonly name = "ProjectController";

  protected async reconcile(req: ReconcileRequest): Promise<ReconcileResult> {
    const { data, error } = await supabase
      .from("projects")
      .select("id,slug,name,repo_provider,repo_identifier,status")
      .eq("id", req.projectId)
      .maybeSingle();

    if (error) return this.retry(`Project lookup failed: ${error.message}`);
    if (!data) return this.retry(`Project ${req.projectId} not found`);

    const project = data as ProjectRow;
    if (project.status !== "active") {
      return this.done("converged", `Project ${project.slug} is ${project.status}`);
    }
    if (!project.repo_identifier) {
      return this.done("blocked", `Project ${project.slug} has no repository identifier`);
    }

    try {
      const provider = providerForProject({
        repo_provider: project.repo_provider,
        slug: project.slug,
        repo_identifier: project.repo_identifier,
      });
      const live = await provider.getProject(project.slug);
      const ref = await provider.getRef(project.slug, live.defaultBranch);
      const signals = await provider.listVerificationSignals(project.slug, ref.commitSha);
      const observedAt = new Date().toISOString();
      const observedState = {
        projectId: project.slug,
        repository: {
          provider: live.provider,
          identifier: live.locator,
          name: live.name,
          active: live.isActive,
        },
        defaultBranch: live.defaultBranch,
        commitSha: ref.commitSha,
        committedAt: ref.committedAt ?? null,
        verificationSignals: signals.map((signal) => ({
          id: signal.id,
          name: signal.name,
          status: signal.status,
          commitSha: signal.commitSha,
          provider: signal.provider,
          startedAt: signal.startedAt ?? null,
          completedAt: signal.completedAt ?? null,
          detailsUrl: signal.detailsUrl ?? null,
        })),
        observedAt,
      };

      const { error: observationError } = await supabase
        .from("provider_observations")
        .upsert({
          project_id: project.id,
          provider: live.provider,
          resource_type: "repository",
          resource_id: live.locator,
          observed_state: observedState,
          observed_at: observedAt,
          source_event_id: req.sourceEventId ?? null,
        }, { onConflict: "project_id,provider,resource_type,resource_id" });
      if (observationError) {
        return this.retry(`Repository observation persistence failed: ${observationError.message}`);
      }

      this.log("info", "Project observation refreshed", {
        projectId: project.id,
        projectSlug: project.slug,
        repository: live.locator,
        commitSha: ref.commitSha,
        signalCount: signals.length,
      });

      return {
        status: "converged",
        observedChanges: [{
          resourceType: "repository",
          resourceId: live.locator,
          field: "commitSha",
          previousValue: null,
          newValue: ref.commitSha,
        }],
        proposedActions: [],
        evidenceIds: [],
        requiresApproval: false,
        message: `Observed ${live.locator}@${ref.commitSha}`,
      };
    } catch (error) {
      return this.retry(error instanceof Error ? error.message : String(error));
    }
  }

  private retry(message: string): ReconcileResult {
    return {
      status: "retry",
      observedChanges: [],
      proposedActions: [],
      evidenceIds: [],
      requiresApproval: false,
      retryAfter: new Date(Date.now() + 5 * 60_000).toISOString(),
      message,
    };
  }

  private done(status: ReconcileResult["status"], message: string): ReconcileResult {
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
