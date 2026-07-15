import { Router } from "express";
import { randomUUID } from "node:crypto";
import { supabase } from "../../lib/supabaseClient.js";
import { createRepositoryProvider } from "../../providers/RepositoryProviderFactory.js";
import { requireFounder, type FounderRequest } from "../middleware/requireFounder.js";

export const projectsRouter = Router();

/**
 * GET /projects/:slug
 *
 * Founder-only. Reads the Control Room registry and live repository state
 * through the provider-agnostic factory. Every read remains an audited event.
 */
projectsRouter.get("/:slug", requireFounder, async (req: FounderRequest, res) => {
  const { slug } = req.params;

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (projectError) return res.status(500).json({ error: projectError.message });
  if (!project) {
    return res.status(404).json({ error: `No project registered with slug "${slug}"` });
  }

  const { data: connection } = await supabase
    .from("project_connections")
    .select("provider, connection_config, status")
    .eq("project_id", project.id)
    .eq("status", "active")
    .maybeSingle();

  let live: unknown = null;
  let liveError: string | null = null;

  try {
    const provider = createRepositoryProvider({
      slug: project.slug,
      repoProvider: project.repo_provider,
      repoIdentifier: project.repo_identifier,
      provider: connection?.provider,
      connectionConfig: connection?.connection_config as Record<string, unknown> | null,
    });
    live = await provider.getProject(project.slug);
  } catch (err) {
    liveError = err instanceof Error ? err.message : String(err);
  }

  await supabase.from("project_events").insert({
    project_id: project.id,
    source_event_id: randomUUID(),
    event_type: "project_read",
    severity: liveError ? "warning" : "info",
    screen: "control-room-api",
    metadata: {
      route: `GET /projects/${slug}`,
      read_by: req.founder?.email,
      live_fetch_ok: !liveError,
      provider: connection?.provider ?? project.repo_provider ?? null,
    },
  });

  return res.json({ project, live, liveError });
});
