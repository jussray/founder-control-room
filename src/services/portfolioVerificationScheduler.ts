import { enqueueReconcile } from "../events/outbox.js";
import { supabase } from "../lib/supabaseClient.js";

interface VerificationProject {
  id: string;
  slug: string;
  repo_identifier: string;
  verification_cadence_minutes: number;
}

/**
 * Enqueues only due repositories and never replaces an already-pending retry.
 * The minute-level Cloudflare cron is therefore cheap: most cycles enqueue
 * nothing, while provider outages keep their bounded retry timestamp intact.
 */
export async function enqueueDuePortfolioVerification(): Promise<number> {
  const { data: projects, error: projectError } = await supabase
    .from("projects")
    .select("id,slug,repo_identifier,verification_cadence_minutes")
    .eq("status", "active")
    .eq("verification_enabled", true)
    .not("repo_identifier", "is", null);
  if (projectError) throw new Error(`verification_project_list_failed:${projectError.message}`);

  const candidates = (projects ?? []) as VerificationProject[];
  if (candidates.length === 0) return 0;

  const projectIds = candidates.map((project) => project.id);
  const [{ data: activeRows, error: activeError }, { data: recentRuns, error: runError }] = await Promise.all([
    supabase
      .from("controller_outbox")
      .select("project_id")
      .eq("controller", "ManifestController")
      .is("completed_at", null)
      .in("project_id", projectIds),
    supabase
      .from("repository_verification_runs")
      .select("project_id,received_at")
      .in("project_id", projectIds)
      .order("received_at", { ascending: false })
      .limit(Math.max(100, projectIds.length * 20)),
  ]);
  if (activeError) throw new Error(`verification_outbox_read_failed:${activeError.message}`);
  if (runError) throw new Error(`verification_run_read_failed:${runError.message}`);

  const activeProjectIds = new Set((activeRows ?? []).map((row) => String(row.project_id)));
  const latestRunByProject = new Map<string, number>();
  for (const row of recentRuns ?? []) {
    const projectId = String(row.project_id);
    if (latestRunByProject.has(projectId)) continue;
    latestRunByProject.set(projectId, Date.parse(String(row.received_at)) || 0);
  }

  const now = Date.now();
  let enqueued = 0;
  for (const project of candidates) {
    if (activeProjectIds.has(project.id)) continue;
    const cadenceMs = Math.max(5, project.verification_cadence_minutes || 15) * 60_000;
    const lastRunAt = latestRunByProject.get(project.id) ?? 0;
    if (lastRunAt > 0 && now - lastRunAt < cadenceMs) continue;

    await enqueueReconcile({
      projectId: project.id,
      controller: "ManifestController",
      resourceId: project.repo_identifier,
      reason: "periodic_resync",
    });
    enqueued += 1;
  }

  return enqueued;
}
