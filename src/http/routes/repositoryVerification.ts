import { createHmac, timingSafeEqual } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { supabase } from "../../lib/supabaseClient.js";
import { providerForProject } from "../../providers/providerFactory.js";
import {
  persistActiveInspection,
  persistRepositoryPacket,
  type RegisteredProjectRow,
} from "../../services/repositoryEvidenceStore.js";
import { inspectRepositoryManifest } from "../../services/repositoryVerification.js";
import {
  REPOSITORY_PACKET_SCHEMA_VERSION,
  type IngestedCapability,
  type IngestedCheck,
  type RepositoryVerificationPacket,
} from "../../types/repositoryVerification.js";
import { requireFounder, type FounderRequest } from "../middleware/requireFounder.js";

export const repositoryVerificationRouter = Router();

async function loadProject(slug: string): Promise<RegisteredProjectRow | null> {
  const { data, error } = await supabase
    .from("projects")
    .select("id,slug,name,repo_provider,repo_identifier")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(`project_lookup_failed:${error.message}`);
  if (!data?.repo_identifier) return null;
  return data as RegisteredProjectRow;
}

repositoryVerificationRouter.post(
  "/:slug/verification/scan",
  requireFounder,
  async (req: FounderRequest, res) => {
    try {
      const project = await loadProject(req.params.slug);
      if (!project) return res.status(404).json({ error: "project_not_registered_or_missing_repository" });

      const provider = providerForProject(project);
      const inspection = await inspectRepositoryManifest(provider, project);
      const runId = await persistActiveInspection(project, inspection);

      return res.status(200).json({ runId, project: project.slug, inspection });
    } catch (error) {
      return res.status(500).json({
        error: "repository_scan_failed",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  },
);

repositoryVerificationRouter.get(
  "/:slug/verification",
  requireFounder,
  async (req: FounderRequest, res) => {
    try {
      const project = await loadProject(req.params.slug);
      if (!project) return res.status(404).json({ error: "project_not_registered_or_missing_repository" });

      const [runs, capabilities, findings, manifest] = await Promise.all([
        supabase
          .from("repository_verification_runs")
          .select("*")
          .eq("project_id", project.id)
          .order("received_at", { ascending: false })
          .limit(10),
        supabase
          .from("repository_capability_evidence")
          .select("*")
          .eq("project_id", project.id)
          .order("capability_id", { ascending: true }),
        supabase
          .from("repository_findings")
          .select("*")
          .eq("project_id", project.id)
          .order("last_seen_at", { ascending: false }),
        supabase
          .from("project_manifests")
          .select("*")
          .eq("project_id", project.id)
          .is("superseded_at", null)
          .order("observed_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      const firstError = runs.error ?? capabilities.error ?? findings.error ?? manifest.error;
      if (firstError) throw new Error(firstError.message);

      return res.json({
        project,
        manifest: manifest.data,
        latestRun: runs.data?.[0] ?? null,
        runs: runs.data ?? [],
        capabilities: capabilities.data ?? [],
        findings: findings.data ?? [],
      });
    } catch (error) {
      return res.status(500).json({
        error: "repository_verification_read_failed",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  },
);

repositoryVerificationRouter.post(
  "/:slug/verification/propose-mission",
  requireFounder,
  async (req: FounderRequest, res) => {
    try {
      const project = await loadProject(req.params.slug);
      if (!project) return res.status(404).json({ error: "project_not_registered_or_missing_repository" });

      const requestedIds = Array.isArray(req.body?.findingIds)
        ? req.body.findingIds.filter((id: unknown): id is string => typeof id === "string")
        : null;

      let query = supabase
        .from("repository_findings")
        .select("id,fingerprint,title,detail,suggested_action,severity,mission_id")
        .eq("project_id", project.id)
        .eq("status", "open")
        .is("mission_id", null);
      if (requestedIds && requestedIds.length > 0) query = query.in("id", requestedIds);

      const { data: findings, error: findingError } = await query;
      if (findingError) throw new Error(findingError.message);
      if (!findings || findings.length === 0) {
        return res.status(409).json({ error: "no_open_unassigned_findings" });
      }

      const { data: latestRun } = await supabase
        .from("repository_verification_runs")
        .select("branch,commit_sha")
        .eq("project_id", project.id)
        .order("received_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const { data: manifest } = await supabase
        .from("project_manifests")
        .select("parsed_manifest")
        .eq("project_id", project.id)
        .is("superseded_at", null)
        .order("observed_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const buildAssist = manifest?.parsed_manifest?.buildAssist;
      const highestRisk = findings.some((finding) => ["critical", "high"].includes(String(finding.severity)))
        ? "high"
        : "medium";
      const description = [
        "Repository verification found evidence drift. This mission is a proposal only.",
        "No branch, integration, deployment, rollback, secret, or destructive action is authorized.",
        "",
        ...findings.map((finding) => (
          `- ${finding.title}: ${finding.detail ?? "no detail"}\n  Suggested: ${finding.suggested_action ?? "inspect and prepare a bounded repair"}`
        )),
      ].join("\n");

      const { data: mission, error: missionError } = await supabase
        .from("missions")
        .insert({
          project_id: project.id,
          title: `Repair repository verification drift (${findings.length})`,
          description,
          status: "proposed",
          base_ref: latestRun?.branch ?? "main",
          builder_agent: buildAssist?.enabled ? buildAssist.preferredBuilder ?? null : null,
          risk_level: buildAssist?.riskLevel ?? highestRisk,
          required_checks: findings.map((finding) => finding.fingerprint),
          policy_snapshot: {
            source: "repository_verification",
            source_commit: latestRun?.commit_sha ?? null,
            finding_ids: findings.map((finding) => finding.id),
            requested_by: req.founder?.email ?? "founder",
            approvals_required: ["create_sandbox_workspace", "create_branch", "integrate", "deploy", "rollback"],
          },
        })
        .select("*")
        .single();
      if (missionError || !mission) throw new Error(missionError?.message ?? "mission_insert_failed");

      const { error: assignError } = await supabase
        .from("repository_findings")
        .update({ mission_id: mission.id })
        .in("id", findings.map((finding) => finding.id));
      if (assignError) throw new Error(assignError.message);

      await supabase.from("project_events").insert({
        project_id: project.id,
        event_type: "repository_repair_mission_proposed",
        severity: "warning",
        decision: "founder_review_required",
        metadata: {
          mission_id: mission.id,
          finding_ids: findings.map((finding) => finding.id),
          source_commit: latestRun?.commit_sha ?? null,
        },
      });

      return res.status(201).json({ mission, findings });
    } catch (error) {
      return res.status(500).json({
        error: "repository_mission_proposal_failed",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  },
);

function secretForProject(projectId: string): string {
  const key = `REPOSITORY_INGEST_SECRET_${projectId.replace(/[^a-z0-9]/gi, "_").toUpperCase()}`;
  return process.env[key] ?? process.env.REPOSITORY_INGEST_SECRET ?? "";
}

function verifySignature(body: Buffer, signature: string, secret: string): boolean {
  if (!secret || !signature.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  const actual = signature.slice("sha256=".length).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(actual)) return false;
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(actual, "hex"));
}

function safeString(value: unknown, field: string, max = 300): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > max) {
    throw new Error(`${field}_invalid`);
  }
  return value.trim();
}

function safePath(value: unknown, field: string): string {
  const path = safeString(value, field, 500);
  if (path.startsWith("/") || path.includes("..") || path.includes("\\")) {
    throw new Error(`${field}_unsafe`);
  }
  return path;
}

function safeUrl(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = new URL(safeString(value, "details_url", 1000));
  if (parsed.protocol !== "https:") throw new Error("details_url_must_be_https");
  parsed.username = "";
  parsed.password = "";
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString();
}

function parsePacket(raw: unknown): RepositoryVerificationPacket {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("packet_root_invalid");
  const value = raw as Record<string, unknown>;
  if (value.schemaVersion !== REPOSITORY_PACKET_SCHEMA_VERSION) throw new Error("packet_schema_unsupported");

  const repository = value.repository as Record<string, unknown> | undefined;
  const runner = value.runner as Record<string, unknown> | undefined;
  if (!repository || typeof repository !== "object") throw new Error("packet_repository_invalid");
  if (!runner || typeof runner !== "object") throw new Error("packet_runner_invalid");

  const checksRaw = Array.isArray(value.checks) ? value.checks : [];
  if (checksRaw.length > 200) throw new Error("packet_checks_too_large");
  const checks: IngestedCheck[] = checksRaw.map((candidate, index) => {
    if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
      throw new Error(`check_${index}_invalid`);
    }
    const check = candidate as Record<string, unknown>;
    const status = safeString(check.status, `check_${index}_status`, 20);
    if (!["passed", "failed", "skipped", "pending", "cancelled"].includes(status)) {
      throw new Error(`check_${index}_status_invalid`);
    }
    return {
      id: safeString(check.id, `check_${index}_id`, 100),
      name: safeString(check.name, `check_${index}_name`, 200),
      required: check.required !== false,
      status: status as IngestedCheck["status"],
      detailsUrl: safeUrl(check.detailsUrl),
    };
  });

  const capabilitiesRaw = Array.isArray(value.capabilities) ? value.capabilities : [];
  if (capabilitiesRaw.length > 200) throw new Error("packet_capabilities_too_large");
  const capabilities: IngestedCapability[] = capabilitiesRaw.map((candidate, index) => {
    if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
      throw new Error(`capability_${index}_invalid`);
    }
    const capability = candidate as Record<string, unknown>;
    const claimedStatus = safeString(capability.claimedStatus, `capability_${index}_claimed`, 20);
    const observedStatus = safeString(capability.observedStatus, `capability_${index}_observed`, 20);
    if (!["active", "planned", "retired"].includes(claimedStatus)) {
      throw new Error(`capability_${index}_claimed_invalid`);
    }
    if (!["verified", "drifted", "unverified", "retired"].includes(observedStatus)) {
      throw new Error(`capability_${index}_observed_invalid`);
    }
    const paths = Array.isArray(capability.evidencePaths)
      ? capability.evidencePaths.map((path, pathIndex) => safePath(path, `capability_${index}_path_${pathIndex}`))
      : [];
    return {
      id: safeString(capability.id, `capability_${index}_id`, 100),
      claimedStatus: claimedStatus as IngestedCapability["claimedStatus"],
      observedStatus: observedStatus as IngestedCapability["observedStatus"],
      evidencePaths: paths,
      reason: capability.reason === undefined ? undefined : safeString(capability.reason, `capability_${index}_reason`, 1000),
    };
  });

  const commitSha = safeString(value.commitSha, "commit_sha", 64).toLowerCase();
  const manifestHash = safeString(value.manifestHash, "manifest_hash", 64).toLowerCase();
  if (!/^[a-f0-9]{7,64}$/.test(commitSha)) throw new Error("commit_sha_invalid");
  if (!/^[a-f0-9]{64}$/.test(manifestHash)) throw new Error("manifest_hash_invalid");
  const generatedAt = safeString(value.generatedAt, "generated_at", 50);
  if (!Number.isFinite(Date.parse(generatedAt))) throw new Error("generated_at_invalid");

  return {
    schemaVersion: REPOSITORY_PACKET_SCHEMA_VERSION,
    projectId: safeString(value.projectId, "project_id", 100),
    repository: {
      provider: safeString(repository.provider, "repository_provider", 50),
      identifier: safeString(repository.identifier, "repository_identifier", 300),
    },
    commitSha,
    branch: safeString(value.branch, "branch", 200),
    manifestHash,
    generatedAt: new Date(generatedAt).toISOString(),
    runner: {
      provider: safeString(runner.provider, "runner_provider", 100),
      runId: runner.runId === undefined ? undefined : safeString(runner.runId, "runner_id", 200),
      detailsUrl: safeUrl(runner.detailsUrl),
    },
    checks,
    capabilities,
  };
}

/**
 * POST /ingest/repository-verification
 *
 * Raw-body, HMAC-authenticated endpoint for repo-local runners. Only the
 * hardcoded sanitized packet shape is retained. Unknown fields are discarded.
 */
export async function handleRepositoryVerificationIngest(req: Request, res: Response) {
  try {
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body ?? "");
    if (body.length === 0 || body.length > 512_000) {
      return res.status(400).json({ error: "invalid_body_size" });
    }

    const projectSlug = safeString(req.header("x-control-room-project"), "project_header", 100);
    const deliveryId = safeString(req.header("x-control-room-delivery"), "delivery_header", 200);
    const signature = safeString(req.header("x-control-room-signature"), "signature_header", 100);
    const project = await loadProject(projectSlug);
    if (!project) return res.status(404).json({ error: "project_not_registered" });

    if (!verifySignature(body, signature, secretForProject(projectSlug))) {
      return res.status(401).json({ error: "invalid_signature" });
    }

    const packet = parsePacket(JSON.parse(body.toString("utf8")));
    if (packet.projectId !== project.slug) return res.status(409).json({ error: "project_identity_mismatch" });
    if (
      packet.repository.provider !== project.repo_provider
      || packet.repository.identifier !== project.repo_identifier
    ) {
      return res.status(409).json({ error: "repository_identity_mismatch" });
    }

    const runId = await persistRepositoryPacket(project, deliveryId, packet);
    return res.status(202).json({ accepted: true, runId });
  } catch (error) {
    return res.status(400).json({
      error: "repository_packet_rejected",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}
