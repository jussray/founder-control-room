import { Router } from "express";
import { supabase } from "../../lib/supabaseClient.js";
import { requireFounder, type FounderRequest } from "../middleware/requireFounder.js";

export const portfolioVerificationRouter = Router();

portfolioVerificationRouter.get(
  "/repositories",
  requireFounder,
  async (_req: FounderRequest, res) => {
    try {
      const { data: projects, error: projectError } = await supabase
        .from("projects")
        .select("id,slug,name,repo_provider,repo_identifier,status,risk_level,verification_enabled,verification_cadence_minutes")
        .eq("verification_enabled", true)
        .order("name", { ascending: true });
      if (projectError) throw new Error(projectError.message);

      const projectIds = (projects ?? []).map((project) => String(project.id));
      if (projectIds.length === 0) return res.json({ repositories: [], generatedAt: new Date().toISOString() });

      const [runs, findings, capabilities, missions] = await Promise.all([
        supabase
          .from("repository_verification_runs")
          .select("project_id,source,branch,commit_sha,manifest_hash,overall_status,scanned_at,received_at")
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
          .select("project_id,capability_id,claimed_status,observed_status,last_verified_at")
          .in("project_id", projectIds),
        supabase
          .from("missions")
          .select("id,project_id,status,risk_level,created_at")
          .in("project_id", projectIds)
          .in("status", ["proposed", "approved", "running", "awaiting_review"]),
      ]);

      const firstError = runs.error ?? findings.error ?? capabilities.error ?? missions.error;
      if (firstError) throw new Error(firstError.message);

      const latestRunByProject = new Map<string, Record<string, unknown>>();
      for (const run of runs.data ?? []) {
        const projectId = String(run.project_id);
        if (!latestRunByProject.has(projectId)) latestRunByProject.set(projectId, run);
      }

      const repositories = (projects ?? []).map((project) => {
        const projectId = String(project.id);
        const projectFindings = (findings.data ?? []).filter((finding) => String(finding.project_id) === projectId);
        const projectCapabilities = (capabilities.data ?? []).filter((capability) => String(capability.project_id) === projectId);
        const projectMissions = (missions.data ?? []).filter((mission) => String(mission.project_id) === projectId);
        const latestRun = latestRunByProject.get(projectId) ?? null;
        const receivedAt = latestRun ? Date.parse(String(latestRun.received_at)) : 0;
        const cadenceMinutes = Number(project.verification_cadence_minutes) || 15;

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
          latestRun,
          nextDueAt: receivedAt > 0
            ? new Date(receivedAt + cadenceMinutes * 60_000).toISOString()
            : new Date().toISOString(),
          findings: {
            total: projectFindings.length,
            critical: projectFindings.filter((finding) => finding.severity === "critical").length,
            high: projectFindings.filter((finding) => finding.severity === "high").length,
            assignedToMission: projectFindings.filter((finding) => Boolean(finding.mission_id)).length,
          },
          capabilities: {
            total: projectCapabilities.length,
            verified: projectCapabilities.filter((capability) => capability.observed_status === "verified").length,
            drifted: projectCapabilities.filter((capability) => capability.observed_status === "drifted").length,
            unverified: projectCapabilities.filter((capability) => capability.observed_status === "unverified").length,
          },
          openMissions: projectMissions,
        };
      });

      return res.json({ repositories, generatedAt: new Date().toISOString() });
    } catch (error) {
      return res.status(500).json({
        error: "portfolio_verification_read_failed",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  },
);
