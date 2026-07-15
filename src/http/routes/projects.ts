import { Router } from "express";
import { randomUUID } from "node:crypto";
import { supabase } from "../../lib/supabaseClient.js";
import { providerForProject } from "../../providers/providerFactory.js";
import type { RepositoryProvider } from "../../providers/RepositoryProvider.js";
import { requireFounder, type FounderRequest } from "../middleware/requireFounder.js";
import { AUTHORITY_LEVEL_IDS } from "../../lib/authorityLevels.js";

export const projectsRouter = Router();

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * GET /projects
 *
 * Founder-only registry listing — every project the Control Room manages,
 * newest first. This is the read side of the Project Registry; there is no
 * live-repository fetch here (that's `GET /projects/:slug`), just the
 * Control Room's own rows.
 */
projectsRouter.get("/", requireFounder, async (_req: FounderRequest, res) => {
  const { data: projects, error } = await supabase
    .from("projects")
    .select("id, slug, name, repo_provider, repo_identifier, stack, status, risk_level, created_at, updated_at")
    .order("created_at", { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  return res.json({ projects: projects ?? [] });
});

/**
 * POST /projects
 * Body: { slug, name, repoProvider?, repoIdentifier?, stack?, riskLevel? }
 *
 * Registers a new project into the Control Room registry — the generic
 * version of the one-off `POST /l99/seed` script. Every product/repo the
 * Control Room manages is a row here; nothing is hardcoded to one project.
 */
projectsRouter.post("/", requireFounder, async (req: FounderRequest, res) => {
  const body = req.body as Record<string, unknown>;
  const slug = typeof body["slug"] === "string" ? body["slug"].trim() : "";
  const name = typeof body["name"] === "string" ? body["name"].trim() : "";

  if (!slug || !name) {
    return res.status(400).json({ error: "slug and name are required" });
  }
  if (!SLUG_PATTERN.test(slug)) {
    return res.status(400).json({ error: "slug must be lowercase alphanumeric segments separated by hyphens" });
  }

  const repoProvider = typeof body["repoProvider"] === "string" ? body["repoProvider"] : "github";
  const repoIdentifier = typeof body["repoIdentifier"] === "string" ? body["repoIdentifier"] : null;
  const stack = typeof body["stack"] === "string" ? body["stack"] : null;
  const riskLevel = typeof body["riskLevel"] === "string" ? body["riskLevel"] : "medium";

  const { data: existing, error: existingError } = await supabase
    .from("projects")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (existingError) return res.status(500).json({ error: existingError.message });
  if (existing) return res.status(409).json({ error: `Project "${slug}" is already registered.` });

  const { data: project, error } = await supabase
    .from("projects")
    .insert({
      slug,
      name,
      repo_provider: repoProvider,
      repo_identifier: repoIdentifier,
      stack,
      risk_level: riskLevel,
      status: "active",
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  await supabase.from("project_events").insert({
    project_id: project.id,
    source_event_id: randomUUID(),
    event_type: "project_registered",
    severity: "info",
    screen: "control-room-api",
    metadata: { route: "POST /projects", registered_by: req.founder?.email },
  });

  return res.status(201).json({ project });
});

/**
 * GET /projects/:slug/releases
 *
 * Release Center — read-only. `docs/BLUEPRINT.md` explicitly lists
 * deployment and rollback execution as NOT allowed yet; this only surfaces
 * the release ledger ReleaseController already populates from
 * deployment_status webhooks, so the founder can see release history
 * without this route becoming a second, ungated deploy trigger.
 */
projectsRouter.get("/:slug/releases", requireFounder, async (req: FounderRequest, res) => {
  const { slug } = req.params;

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (projectError) return res.status(500).json({ error: projectError.message });
  if (!project) return res.status(404).json({ error: `No project registered with slug "${slug}"` });

  const { data: releases, error } = await supabase
    .from("releases")
    .select("id, change_proposal_id, version, commit_sha, status, deployed_at, rolled_back_at, notes")
    .eq("project_id", project.id)
    .order("deployed_at", { ascending: false, nullsFirst: false });

  if (error) return res.status(500).json({ error: error.message });
  return res.json({ releases: releases ?? [] });
});

/**
 * GET /projects/:slug/connections
 *
 * MCP / Connector Hub — lists this project's connection slots (GitHub,
 * Cloudflare, Supabase, Figma, Canva, Shopify, Gmail, AI providers, etc),
 * each with its declared authority level, capabilities, and data boundary.
 * Config is non-secret by design; `secret_ref` is a pointer, never the
 * credential itself (see project_connections' own table comment in
 * 0001_init.sql). This is inventory and visibility — the actual gates
 * (requireFounder, proof-gate, approval_executions) are unaffected by
 * anything recorded here.
 */
projectsRouter.get("/:slug/connections", requireFounder, async (req: FounderRequest, res) => {
  const { slug } = req.params;

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (projectError) return res.status(500).json({ error: projectError.message });
  if (!project) return res.status(404).json({ error: `No project registered with slug "${slug}"` });

  const { data: connections, error } = await supabase
    .from("project_connections")
    .select("id, connection_type, label, config, secret_ref, status, authority_level, capabilities, data_boundary, required_approval, last_checked_at, created_at, updated_at")
    .eq("project_id", project.id)
    .order("created_at", { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  return res.json({ connections: connections ?? [] });
});

const CONNECTION_TYPES = new Set([
  "git", "github", "cloudflare", "supabase", "openai", "anthropic", "perplexity",
  "shopify", "expo", "apple", "google_play", "stripe",
  "figma", "canva", "playwright", "gmail", "calendar", "context7", "other",
]);

/**
 * POST /projects/:slug/connections
 * Body: { connectionType, label?, config?, secretRef?, authorityLevel?, capabilities?, dataBoundary?, requiredApproval? }
 *
 * Registers a connection SLOT — non-secret config and a pointer to where
 * the real credential lives. This route cannot accept or store an actual
 * credential value; `secretRef` is a reference string (e.g. an env var
 * name or secret-manager path), never a token itself.
 */
projectsRouter.post("/:slug/connections", requireFounder, async (req: FounderRequest, res) => {
  const { slug } = req.params;
  const body = req.body as Record<string, unknown>;
  const connectionType = typeof body["connectionType"] === "string" ? body["connectionType"] : "";

  if (!CONNECTION_TYPES.has(connectionType)) {
    return res.status(400).json({ error: `connectionType must be one of: ${[...CONNECTION_TYPES].join(", ")}` });
  }

  const authorityLevel = typeof body["authorityLevel"] === "string" ? body["authorityLevel"] : null;
  if (authorityLevel !== null && !AUTHORITY_LEVEL_IDS.has(authorityLevel)) {
    return res.status(400).json({ error: `authorityLevel must be one of: ${[...AUTHORITY_LEVEL_IDS].join(", ")}` });
  }

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (projectError) return res.status(500).json({ error: projectError.message });
  if (!project) return res.status(404).json({ error: `No project registered with slug "${slug}"` });

  const label = typeof body["label"] === "string" ? body["label"] : null;
  const config = typeof body["config"] === "object" && body["config"] !== null ? body["config"] : {};
  const secretRef = typeof body["secretRef"] === "string" ? body["secretRef"] : null;
  const capabilities = Array.isArray(body["capabilities"]) && body["capabilities"].every((c) => typeof c === "string")
    ? body["capabilities"]
    : [];
  const dataBoundary = typeof body["dataBoundary"] === "string" ? body["dataBoundary"] : null;
  const requiredApproval = typeof body["requiredApproval"] === "string" ? body["requiredApproval"] : null;

  const { data: connection, error } = await supabase
    .from("project_connections")
    .insert({
      project_id: project.id,
      connection_type: connectionType,
      label,
      config,
      secret_ref: secretRef,
      status: "active",
      authority_level: authorityLevel,
      capabilities,
      data_boundary: dataBoundary,
      required_approval: requiredApproval,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return res.status(409).json({ error: `A "${connectionType}" connection with that label already exists for this project.` });
    }
    return res.status(500).json({ error: error.message });
  }

  await supabase.from("project_events").insert({
    project_id: project.id,
    source_event_id: randomUUID(),
    event_type: "project_connection_registered",
    severity: "info",
    screen: "control-room-api",
    metadata: { route: `POST /projects/${slug}/connections`, registered_by: req.founder?.email, connectionType, authorityLevel },
  });

  return res.status(201).json({ connection });
});

/**
 * POST /projects/:slug/connections/:connectionId/check
 * Body: { status? }
 *
 * Records a founder-triggered connector health check — sets
 * last_checked_at to now, and optionally updates status. This does not
 * call the provider itself (no credential lives in this process for most
 * of these connectors); it records that a human or an external tool
 * confirmed the connection works, the same way GET /agents and Bench keep
 * machine evidence separate from founder attestation.
 */
projectsRouter.post("/:slug/connections/:connectionId/check", requireFounder, async (req: FounderRequest, res) => {
  const { slug, connectionId } = req.params;
  const body = req.body as Record<string, unknown>;
  const status = typeof body["status"] === "string" ? body["status"] : undefined;

  if (status && !["active", "disconnected", "error"].includes(status)) {
    return res.status(400).json({ error: "status must be one of: active, disconnected, error" });
  }

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (projectError) return res.status(500).json({ error: projectError.message });
  if (!project) return res.status(404).json({ error: `No project registered with slug "${slug}"` });

  const { data: existing, error: existingError } = await supabase
    .from("project_connections")
    .select("id")
    .eq("id", connectionId)
    .eq("project_id", project.id)
    .maybeSingle();
  if (existingError) return res.status(500).json({ error: existingError.message });
  if (!existing) return res.status(404).json({ error: "Connection not found for this project" });

  const update: Record<string, unknown> = {
    last_checked_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (status) update["status"] = status;

  const { data: connection, error } = await supabase
    .from("project_connections")
    .update(update)
    .eq("id", connectionId)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  await supabase.from("project_events").insert({
    project_id: project.id,
    source_event_id: randomUUID(),
    event_type: "project_connection_checked",
    severity: "info",
    screen: "control-room-api",
    metadata: { route: `POST /projects/${slug}/connections/${connectionId}/check`, checked_by: req.founder?.email, status: status ?? connection.status },
  });

  return res.json({ connection });
});

// Mirrors reconciliation/types.ts's EvidenceKind union — that's a
// compile-time-only type, so this runtime list has to be kept in sync by
// hand. A mission with an empty required_checks list can NEVER leave
// 'sandboxed' (MissionController.reconcile() refuses to evaluate evidence
// with nothing required — see that file), so this is not an optional nicety.
const EVIDENCE_KINDS = new Set([
  "typecheck", "lint", "unit_test", "integration_test", "browser_test",
  "security_scan", "preview_health", "deployment_result",
  "migration_verification", "storefront_check", "artifact_provenance", "rls_audit",
]);

/**
 * POST /projects/:slug/missions
 * Body: { title, description?, riskLevel?, builderAgent?, reviewerAgent?, requiredChecks? }
 *
 * Creates a new mission (the Issues/task-equivalent) under a project,
 * status 'proposed'. This is the founder-initiated entry point into the
 * mission lifecycle — everything else (sandbox branch, patch, proof gate,
 * merge) acts on a mission that already exists. builderAgent/reviewerAgent
 * can also be set later via PATCH /missions/:missionId.
 *
 * requiredChecks matters more than it looks: leave it empty and this
 * mission can never automatically advance past 'sandboxed', because
 * MissionController requires at least one required check kind before it
 * will evaluate evidence at all.
 */
projectsRouter.post("/:slug/missions", requireFounder, async (req: FounderRequest, res) => {
  const { slug } = req.params;
  const body = req.body as Record<string, unknown>;
  const title = typeof body["title"] === "string" ? body["title"].trim() : "";

  if (!title) return res.status(400).json({ error: "title is required" });

  const requiredChecksInput = body["requiredChecks"];
  if (requiredChecksInput !== undefined) {
    if (!Array.isArray(requiredChecksInput) || !requiredChecksInput.every((k) => typeof k === "string" && EVIDENCE_KINDS.has(k))) {
      return res.status(400).json({ error: `requiredChecks must be an array drawn from: ${[...EVIDENCE_KINDS].join(", ")}` });
    }
  }
  const requiredChecks = Array.isArray(requiredChecksInput) ? requiredChecksInput : [];

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (projectError) return res.status(500).json({ error: projectError.message });
  if (!project) return res.status(404).json({ error: `No project registered with slug "${slug}"` });

  const description = typeof body["description"] === "string" ? body["description"] : null;
  const riskLevel = typeof body["riskLevel"] === "string" ? body["riskLevel"] : "medium";
  const builderAgent = typeof body["builderAgent"] === "string" ? body["builderAgent"] : null;
  const reviewerAgent = typeof body["reviewerAgent"] === "string" ? body["reviewerAgent"] : null;

  const { data: mission, error } = await supabase
    .from("missions")
    .insert({
      project_id: project.id,
      title,
      description,
      risk_level: riskLevel,
      builder_agent: builderAgent,
      reviewer_agent: reviewerAgent,
      required_checks: requiredChecks,
      status: "proposed",
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  await supabase.from("project_events").insert({
    project_id: project.id,
    source_event_id: randomUUID(),
    event_type: "mission_created",
    severity: "info",
    screen: "control-room-api",
    metadata: { route: `POST /projects/${slug}/missions`, created_by: req.founder?.email, missionId: mission.id },
  });

  return res.status(201).json({ mission });
});

/**
 * GET /projects/:slug
 *
 * Founder-only. Reads both the Control Room registry row and live repository
 * identity through the provider abstraction. Every read remains audited.
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
    return res.status(404).json({ error: `No project registered with slug ${slug}` });
  }

  let live: unknown = null;
  let liveError: string | null = null;

  if (project.repo_identifier) {
    try {
      const provider = providerForProject({
        repo_provider: project.repo_provider,
        slug: project.slug,
        repo_identifier: project.repo_identifier,
      });
      live = await provider.getProject(project.slug);
    } catch (error) {
      liveError = error instanceof Error ? error.message : String(error);
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
      provider: project.repo_provider ?? null,
    },
  });

  return res.json({ project, live, liveError });
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
    provider = providerForProject({ repo_provider: project.repo_provider, slug: project.slug, repo_identifier: project.repo_identifier });
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
    provider = providerForProject({ repo_provider: project.repo_provider, slug: project.slug, repo_identifier: project.repo_identifier });
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
