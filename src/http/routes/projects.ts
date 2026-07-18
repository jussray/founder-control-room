import { Router } from "express";
import { randomUUID } from "node:crypto";
import { supabase } from "../../lib/supabaseClient.js";
import { GitHubProvider } from "../../providers/GitHubProvider.js";
import type { RepositoryProvider } from "../../providers/RepositoryProvider.js";
import { requireFounder, type FounderRequest } from "../middleware/requireFounder.js";

export const projectsRouter = Router();

/**
 * Builds a RepositoryProvider for a single project row on demand, rather
 * than hardcoding a global projectMap. This is the multi-project-shaped
 * version: any project in the registry with repo_provider = "github" gets
 * a GitHubProvider constructed from ITS OWN repo_identifier, not Bip's.
 */
function providerForProject(repoProvider: string, slug: string, repoIdentifier: string): RepositoryProvider {
  if (repoProvider === "github") {
    const token = process.env.GITHUB_TOKEN;
    if (!token) throw new Error("GITHUB_TOKEN is not set");
    return new GitHubProvider({
      token,
      projectMap: { [slug]: repoIdentifier },
    });
  }
  throw new Error(`No RepositoryProvider implementation for "${repoProvider}" yet`);
}

/**
 * GET /projects/:slug
 *
 * Founder-only. Reads both:
 *   - the Control Room's own registry row (Supabase `projects` table)
 *   - the live repository state (via RepositoryProvider — GitHub today,
 *     swappable later without this route changing)
 *
 * Every read is logged to `project_events` as `project_read` — "read
 * project" is allowed during discussion under the L99 model, but it's
 * still an audited action, not a silent one.
 */
projectsRouter.get("/:slug", requireFounder, async (req: FounderRequest, res) => {
  const { slug } = req.params;

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (projectError) {
    return res.status(500).json({ error: projectError.message });
  }
  if (!project) {
    return res.status(404).json({ error: `No project registered with slug "${slug}"` });
  }

  let live: unknown = null;
  let liveError: string | null = null;

  if (project.repo_identifier) {
    try {
      const provider = providerForProject(project.repo_provider, project.slug, project.repo_identifier);
      live = await provider.getProject(project.slug);
    } catch (err) {
      liveError = err instanceof Error ? err.message : String(err);
    }
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
    },
  });

  return res.json({
    project,
    live,
    liveError,
  });
});

/**
 * GET /projects/:slug/files?ref=&path=
 *
 * Founder-only read of repository directory contents at a ref. Defaults to
 * the repo's live default branch when `ref` is omitted. Every read is
 * audited to `project_events`, same as `GET /projects/:slug`.
 */
projectsRouter.get("/:slug/files", requireFounder, async (req: FounderRequest, res) => {
  const { slug } = req.params;
  const path = typeof req.query.path === "string" ? req.query.path : "";
  const requestedRef = typeof req.query.ref === "string" ? req.query.ref : undefined;

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (projectError) return res.status(500).json({ error: projectError.message });
  if (!project) return res.status(404).json({ error: `No project registered with slug "${slug}"` });
  if (!project.repo_identifier) {
    return res.status(503).json({ error: "Project has no repository configured.", code: "REPOSITORY_PROVIDER_UNAVAILABLE" });
  }

  let provider: RepositoryProvider;
  try {
    provider = providerForProject(project.repo_provider, project.slug, project.repo_identifier);
  } catch (err) {
    return res.status(503).json({ error: err instanceof Error ? err.message : "Repository provider unavailable" });
  }

  try {
    const ref = requestedRef ?? (await provider.getProject(project.slug)).defaultBranch;
    const entries = await provider.listFiles(project.slug, ref, path);

    await supabase.from("project_events").insert({
      project_id: project.id,
      source_event_id: randomUUID(),
      event_type: "project_files_read",
      severity: "info",
      screen: "control-room-api",
      metadata: { route: `GET /projects/${slug}/files`, read_by: req.founder?.email, ref, path },
    });

    return res.json({ ref, path, entries });
  } catch (err) {
    return res.status(502).json({ error: err instanceof Error ? err.message : "Failed to list files" });
  }
});

/**
 * GET /projects/:slug/file?ref=&path=
 *
 * Founder-only read of a single file's content at a ref. `path` is required.
 * Defaults to the repo's live default branch when `ref` is omitted.
 */
projectsRouter.get("/:slug/file", requireFounder, async (req: FounderRequest, res) => {
  const { slug } = req.params;
  const path = typeof req.query.path === "string" ? req.query.path : "";
  const requestedRef = typeof req.query.ref === "string" ? req.query.ref : undefined;

  if (!path.trim()) {
    return res.status(400).json({ error: "path query parameter is required" });
  }

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (projectError) return res.status(500).json({ error: projectError.message });
  if (!project) return res.status(404).json({ error: `No project registered with slug "${slug}"` });
  if (!project.repo_identifier) {
    return res.status(503).json({ error: "Project has no repository configured.", code: "REPOSITORY_PROVIDER_UNAVAILABLE" });
  }

  let provider: RepositoryProvider;
  try {
    provider = providerForProject(project.repo_provider, project.slug, project.repo_identifier);
  } catch (err) {
    return res.status(503).json({ error: err instanceof Error ? err.message : "Repository provider unavailable" });
  }

  try {
    const ref = requestedRef ?? (await provider.getProject(project.slug)).defaultBranch;
    const content = await provider.readFile(project.slug, ref, path);

    await supabase.from("project_events").insert({
      project_id: project.id,
      source_event_id: randomUUID(),
      event_type: "project_file_read",
      severity: "info",
      screen: "control-room-api",
      metadata: { route: `GET /projects/${slug}/file`, read_by: req.founder?.email, ref, path },
    });

    return res.json({ ref, path, content });
  } catch (err) {
    return res.status(502).json({ error: err instanceof Error ? err.message : "Failed to read file" });
  }
});
