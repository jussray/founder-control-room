import { Router } from "express";
import { supabase } from "../../lib/supabaseClient.js";
import { requireFounder, type FounderRequest } from "../middleware/requireFounder.js";

export const portfolioVerificationRouter = Router();

const ACTIVE_MISSION_STATUSES = [
  "proposed",
  "sandboxed",
  "in_review",
  "approved",
];

interface VerificationRunRow {
  project_id: string;
  source: string;
  branch: string;
  commit_sha: string;
  manifest_hash: string;
  overall_status: string;
  signature_verified: boolean;
  runner: Record<string, unknown> | null;
  scanned_at: string;
  received_at: string;
}

interface CapabilityRow {
  project_id: string;
  capability_id: string;
  claimed_status: string;
  observed_status: string;
  usage_assertion_ids: string[] | null;
  failed_usage_assertion_ids: string[] | null;
  last_verified_at: string;
}

function isManualPreview(run: VerificationRunRow | null): boolean {
  return typeof run?.runner?.mode === "string"
    && run.runner.mode.startsWith("preview_branch_");
}

function evidenceKind(
  run: VerificationRunRow | null,
): "none" | "signed" | "manual_preview" | "unsigned" {
  if (!run) return "none";
  if (run.signature_verified) return "signed";
  if (isManualPreview(run)) return "manual_preview";
  return "unsigned";
}

portfolioVerificationRouter.get(
  "/repositories",
  requireFounder,
  async (_req: FounderRequest, res) => {
    try {
      const { data: projects, error: projectError } = await supabase
        .from("projects")
        .select(
          "id,slug,name,repo_provider,repo_identifier,status,risk_level,verification_enabled,verification_cadence_minutes",
        )
        .eq("verification_enabled", true)
        .order("name", { ascending: true });
      if (projectError) throw new Error(projectError.message);

      const projectIds = (projects ?? []).map((project) => String(project.id));
      if (projectIds.length === 0) {
        return res.json({
          repositories: [],
          generatedAt: new Date().toISOString(),
        });
      }

      const [runs, findings, capabilities, missions] = await Promise.all([
        supabase
          .from("repository_verification_runs")
          .select(
            "project_id,source,branch,commit_sha,manifest_hash,overall_status,signature_verified,runner,scanned_at,received_at",
          )
          .in("project_id", projectIds)
          .order("received_at", { ascending: false })
          .limit(Math.max(100, projectIds.length * 20)),
        supabase
          .from("repository_findings")
          .select("project_id,severity,status,category,mission_id")
          .in("project_id", projectIds)
          .eq("status", "open"),
        supabase
          .from("repository_capability_evidence")
          .select(
            "project_id,capability_id,claimed_status,observed_status,usage_assertion_ids,failed_usage_assertion_ids,last_verified_at",
          )
          .in("project_id", projectIds),
        supabase
          .from("missions")
          .select(
            "id,project_id,title,status,risk_level,base_ref,builder_agent,created_at",
          )
          .in("project_id", projectIds)
          .in("status", ACTIVE_MISSION_STATUSES),
      ]);

      const firstError = runs.error
        ?? findings.error
        ?? capabilities.error
        ?? missions.error;
      if (firstError) throw new Error(firstError.message);

      const latestRunByProject = new Map<string, VerificationRunRow>();
      for (const rawRun of runs.data ?? []) {
        const run = rawRun as VerificationRunRow;
        const projectId = String(run.project_id);
        if (!latestRunByProject.has(projectId)) {
          latestRunByProject.set(projectId, run);
        }
      }

      const capabilityRows = (capabilities.data ?? []) as CapabilityRow[];
      const repositories = (projects ?? []).map((project) => {
        const projectId = String(project.id);
        const projectFindings = (findings.data ?? []).filter(
          (finding) => String(finding.project_id) === projectId,
        );
        const projectCapabilities = capabilityRows.filter(
          (capability) => String(capability.project_id) === projectId,
        );
        const projectMissions = (missions.data ?? []).filter(
          (mission) => String(mission.project_id) === projectId,
        );
        const latestRun = latestRunByProject.get(projectId) ?? null;
        const receivedAt = latestRun
          ? Date.parse(String(latestRun.received_at))
          : 0;
        const cadenceMinutes = Number(project.verification_cadence_minutes) || 15;
        const usageAssertionCount = projectCapabilities.reduce(
          (total, capability) =>
            total + (capability.usage_assertion_ids?.length ?? 0),
          0,
        );
        const failedUsageAssertionCount = projectCapabilities.reduce(
          (total, capability) =>
            total + (capability.failed_usage_assertion_ids?.length ?? 0),
          0,
        );

        return {
          id: project.id,
          slug: project.slug,
          name: project.name,
          repository: {
            provider: project.repo_provider,
            identifier: project.repo_identifier,
          },
          status: project.status,
          riskLevel: project.risk_level,
          verificationCadenceMinutes: cadenceMinutes,
          evidence: {
            kind: evidenceKind(latestRun),
            signatureVerified: latestRun?.signature_verified ?? false,
            manualPreview: isManualPreview(latestRun),
            source: latestRun?.source ?? null,
            branch: latestRun?.branch ?? null,
          },
          latestRun,
          nextDueAt: receivedAt > 0
            ? new Date(receivedAt + cadenceMinutes * 60_000).toISOString()
            : new Date().toISOString(),
          findings: {
            total: projectFindings.length,
            critical: projectFindings.filter(
              (finding) => finding.severity === "critical",
            ).length,
            high: projectFindings.filter(
              (finding) => finding.severity === "high",
            ).length,
            assignedToMission: projectFindings.filter(
              (finding) => Boolean(finding.mission_id),
            ).length,
          },
          capabilities: {
            total: projectCapabilities.length,
            verified: projectCapabilities.filter(
              (capability) => capability.observed_status === "verified",
            ).length,
            drifted: projectCapabilities.filter(
              (capability) => capability.observed_status === "drifted",
            ).length,
            unverified: projectCapabilities.filter(
              (capability) => capability.observed_status === "unverified",
            ).length,
            usageAssertions: usageAssertionCount,
            failedUsageAssertions: failedUsageAssertionCount,
          },
          openMissions: projectMissions,
        };
      });

      return res.json({
        repositories,
        generatedAt: new Date().toISOString(),
      });
    } catch (error) {
      return res.status(500).json({
        error: "portfolio_verification_read_failed",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  },
);
