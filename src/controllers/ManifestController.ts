import { supabase } from "../lib/supabaseClient.js";
import { providerForProject } from "../providers/providerFactory.js";
import { persistActiveInspection } from "../services/repositoryEvidenceStore.js";
import { inspectRepositoryManifest } from "../services/repositoryVerification.js";
import type { ReconcileRequest, ReconcileResult } from "../reconciliation/types.js";
import { BaseController } from "./base.js";

interface ProjectRow {
  id: string;
  slug: string;
  name: string;
  repo_provider: string;
  repo_identifier: string | null;
  status: "active" | "paused" | "archived";
  verification_enabled: boolean;
}

/**
 * Verifies one repository against the manifest owned by that repository.
 *
 * The controller is read-only toward the product repo. It stores sanitized
 * evidence in Founder Control Room and may propose a future mission, but it
 * never creates branches, integrates, deploys, or rolls back.
 */
export class ManifestController extends BaseController {
  readonly name = "ManifestController";

  protected async reconcile(req: ReconcileRequest): Promise<ReconcileResult> {
    const { data, error } = await supabase
      .from("projects")
      .select("id,slug,name,repo_provider,repo_identifier,status,verification_enabled")
      .eq("id", req.projectId)
      .maybeSingle();

    if (error) return this.retry(`Project lookup failed: ${error.message}`);
    if (!data) return this.retry(`Project ${req.projectId} was not found`);

    const project = data as ProjectRow;
    if (project.status !== "active" || !project.verification_enabled) {
      return this.done("converged", `Repository verification is disabled for ${project.slug}`);
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
      const inspection = await inspectRepositoryManifest(provider, {
        slug: project.slug,
        repo_provider: project.repo_provider,
        repo_identifier: project.repo_identifier,
      });
      const runId = await persistActiveInspection(
        {
          id: project.id,
          slug: project.slug,
          name: project.name,
          repo_provider: project.repo_provider,
          repo_identifier: project.repo_identifier,
        },
        inspection,
      );

      const driftedCapabilities = inspection.capabilities
        .filter((capability) => capability.observedStatus === "drifted")
        .map((capability) => capability.id);
      const failedChecks = inspection.checks
        .filter((check) => check.required && check.status !== "passed")
        .map((check) => check.id);
      const drifted = inspection.overallStatus !== "passed";

      this.log(drifted ? "warn" : "info", "Repository manifest reconciled", {
        projectId: project.id,
        projectSlug: project.slug,
        commitSha: inspection.commitSha,
        overallStatus: inspection.overallStatus,
        failedChecks,
        driftedCapabilities,
      });

      return {
        status: drifted ? "drifted" : "converged",
        observedChanges: [
          {
            resourceType: "repository_verification",
            resourceId: project.repo_identifier,
            field: "overallStatus",
            previousValue: null,
            newValue: inspection.overallStatus,
          },
        ],
        proposedActions: drifted
          ? [{
              actionType: "propose_repository_repair_mission",
              resourceType: "repository",
              resourceId: project.repo_identifier,
              requiresApproval: true,
              idempotencyKey: this.idempotencyKey(
                project.id,
                runId,
                "propose_repository_repair_mission",
                inspection.commitSha,
              ),
              payload: {
                verificationRunId: runId,
                commitSha: inspection.commitSha,
                failedChecks,
                driftedCapabilities,
              },
            }]
          : [],
        evidenceIds: [runId],
        requiresApproval: drifted,
        message: drifted
          ? `Repository ${project.slug} requires founder review`
          : `Repository ${project.slug} verified at ${inspection.commitSha}`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log("warn", "Repository verification provider read failed", {
        projectId: project.id,
        projectSlug: project.slug,
        error: message,
      });
      return this.retry(message);
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
