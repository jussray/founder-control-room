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
      if (!project) {
        return res.status(404).json({
          error: "project_not_registered_or_missing_repository",
        });
      }

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
      if (!project) {
        return res.status(404).json({
          error: "project_not_registered_or_missing_repository",
        });
      }

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

      const firstError = runs.error
        ?? capabilities.error
        ?? findings.error
        ?? manifest.error;
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
      if (!project) {
        return res.status(404).json({
          error: "project_not_registered_or_missing_repository",
        });
      }

      const userId = req.founder?.userId;
      if (!userId) return res.status(403).json({ error: "founder_identity_required" });

      const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const input: unknown = req.body?.findingIds;
      let requestedIds: string[] | null = null;
      if (input !== undefined) {
        if (!Array.isArray(input) || input.length < 1 || input.length > 100
          || !input.every((id: unknown) => typeof id === "string" && uuid.test(id))) {
          return res.status(400).json({ error: "invalid_repair_finding_ids" });
        }
        requestedIds = input.map((id: string) => id.toLowerCase());
        if (new Set(requestedIds).size !== requestedIds.length) {
          return res.status(400).json({ error: "duplicate_repair_finding_ids" });
        }
      }

      const { data: latestRun, error: runError } = await supabase
        .from("repository_verification_runs")
        .select("id,branch,commit_sha,signature_verified,overall_status")
        .eq("project_id", project.id)
        .order("received_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (runError) throw new Error("repair_evidence_read_failed");
      if (!latestRun || latestRun.signature_verified !== true
        || !["warning", "failed"].includes(latestRun.overall_status)
        || !/^[a-f0-9]{40}$/.test(latestRun.commit_sha ?? "")
        || /^0{40}$/.test(latestRun.commit_sha)) {
        return res.status(409).json({ error: "repair_evidence_not_authoritative" });
      }

      if (requestedIds === null) {
        const { data: candidates, error: candidateError } = await supabase
          .from("repository_findings")
          .select("id")
          .eq("project_id", project.id)
          .eq("verification_run_id", latestRun.id)
          .eq("status", "open")
          .is("mission_id", null)
          .order("id", { ascending: true })
          .limit(101);
        if (candidateError) throw new Error("repair_findings_read_failed");
        if (!candidates?.length) {
          return res.status(409).json({ error: "no_open_unassigned_findings" });
        }
        if (candidates.length > 100) {
          return res.status(409).json({ error: "explicit_bounded_finding_selection_required" });
        }
        requestedIds = candidates.map((finding) => String(finding.id));
      }

      // One database transaction owns the mission, findings and event. Never
      // fall back to the predecessor's separate inserts if the RPC is missing.
      const { data: reservation, error: reservationError } = await supabase.rpc(
        "reserve_repository_repair_mission", {
          p_project_id: project.id,
          p_run_id: latestRun.id,
          p_finding_ids: requestedIds,
          p_requested_by_user_id: userId,
        },
      );
      if (reservationError) {
        if (["PGRST202", "42883"].includes(reservationError.code)) {
          return res.status(503).json({ error: "atomic_repair_reservation_unavailable" });
        }
        if (["40001", "22023", "P0002"].includes(reservationError.code)) {
          return res.status(409).json({ error: "repair_reservation_conflict_or_stale_evidence" });
        }
        throw new Error("repair_reservation_failed");
      }
      if (!reservation || typeof reservation.mission_id !== "string"
        || !uuid.test(reservation.mission_id)
        || typeof reservation.created !== "boolean"
        || reservation.authority !== "proposal_only" || reservation.mutation_authorized !== false) {
        throw new Error("repair_reservation_receipt_invalid");
      }

      const [{ data: mission, error: missionError }, { data: findings, error: findingError }] =
        await Promise.all([
          supabase.from("missions").select("*").eq("project_id", project.id)
            .eq("id", reservation.mission_id).maybeSingle(),
          supabase.from("repository_findings")
            .select("id,fingerprint,title,detail,suggested_action,severity,mission_id")
            .eq("project_id", project.id).eq("mission_id", reservation.mission_id)
            .in("id", requestedIds),
        ]);
      if (missionError || findingError || !mission || findings?.length !== requestedIds.length) {
        return res.status(503).json({ error: "repair_reservation_readback_unavailable",
          retryWithFindingIds: requestedIds });
      }
      return res.status(reservation.created ? 201 : 200).json({
        mission, findings, created: reservation.created, authority: "proposal_only",
        mutationAuthorized: false,
      });
    } catch (error) {
      return res.status(500).json({
        error: "repository_mission_proposal_failed",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  },
);

function secretForProject(projectId: string): string {
  const key = `REPOSITORY_INGEST_SECRET_${projectId
    .replace(/[^a-z0-9]/gi, "_")
    .toUpperCase()}`;
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
  if (
    typeof value !== "string"
    || value.trim().length === 0
    || value.length > max
  ) {
    throw new Error(`${field}_invalid`);
  }
  return value.trim();
}

function safePath(value: unknown, field: string): string {
  const path = safeString(value, field, 500);
  if (
    path.startsWith("/")
    || path.includes("\\")
    || path.split("/").includes("..")
  ) {
    throw new Error(`${field}_unsafe`);
  }
  return path;
}

function safeIdArray(
  value: unknown,
  field: string,
  maxItems = 200,
): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new Error(`${field}_invalid`);
  }
  const ids = value.map((candidate, index) =>
    safeString(candidate, `${field}_${index}`, 100));
  if (new Set(ids).size !== ids.length) throw new Error(`${field}_duplicates`);
  return ids;
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
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("packet_root_invalid");
  }
  const value = raw as Record<string, unknown>;
  if (value.schemaVersion !== REPOSITORY_PACKET_SCHEMA_VERSION) {
    throw new Error("packet_schema_unsupported");
  }

  const repository = value.repository as Record<string, unknown> | undefined;
  const runner = value.runner as Record<string, unknown> | undefined;
  if (!repository || typeof repository !== "object") {
    throw new Error("packet_repository_invalid");
  }
  if (!runner || typeof runner !== "object") {
    throw new Error("packet_runner_invalid");
  }

  const checksRaw = Array.isArray(value.checks) ? value.checks : [];
  if (checksRaw.length > 200) throw new Error("packet_checks_too_large");
  const checks: IngestedCheck[] = checksRaw.map((candidate, index) => {
    if (
      typeof candidate !== "object"
      || candidate === null
      || Array.isArray(candidate)
    ) {
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
  if (capabilitiesRaw.length > 200) {
    throw new Error("packet_capabilities_too_large");
  }
  const capabilities: IngestedCapability[] = capabilitiesRaw.map(
    (candidate, index) => {
      if (
        typeof candidate !== "object"
        || candidate === null
        || Array.isArray(candidate)
      ) {
        throw new Error(`capability_${index}_invalid`);
      }
      const capability = candidate as Record<string, unknown>;
      const claimedStatus = safeString(
        capability.claimedStatus,
        `capability_${index}_claimed`,
        20,
      );
      const observedStatus = safeString(
        capability.observedStatus,
        `capability_${index}_observed`,
        20,
      );
      if (!["active", "planned", "retired"].includes(claimedStatus)) {
        throw new Error(`capability_${index}_claimed_invalid`);
      }
      if (!["verified", "drifted", "unverified", "retired"].includes(observedStatus)) {
        throw new Error(`capability_${index}_observed_invalid`);
      }

      const evidencePaths = Array.isArray(capability.evidencePaths)
        ? capability.evidencePaths.map((path, pathIndex) =>
            safePath(path, `capability_${index}_path_${pathIndex}`))
        : [];
      const usageAssertionIds = safeIdArray(
        capability.usageAssertionIds,
        `capability_${index}_usage_assertions`,
      );
      const failedUsageAssertionIds = safeIdArray(
        capability.failedUsageAssertionIds,
        `capability_${index}_failed_usage_assertions`,
      );
      if (
        failedUsageAssertionIds.some(
          (assertionId) => !usageAssertionIds.includes(assertionId),
        )
      ) {
        throw new Error(`capability_${index}_failed_usage_not_declared`);
      }

      return {
        id: safeString(capability.id, `capability_${index}_id`, 100),
        claimedStatus: claimedStatus as IngestedCapability["claimedStatus"],
        observedStatus: observedStatus as IngestedCapability["observedStatus"],
        evidencePaths,
        usageAssertionIds,
        failedUsageAssertionIds,
        reason: capability.reason === undefined
          ? undefined
          : safeString(capability.reason, `capability_${index}_reason`, 1000),
      };
    },
  );

  const commitSha = safeString(value.commitSha, "commit_sha", 64).toLowerCase();
  const manifestHash = safeString(value.manifestHash, "manifest_hash", 64)
    .toLowerCase();
  if (!/^[a-f0-9]{7,64}$/.test(commitSha)) {
    throw new Error("commit_sha_invalid");
  }
  if (!/^[a-f0-9]{64}$/.test(manifestHash)) {
    throw new Error("manifest_hash_invalid");
  }
  const generatedAt = safeString(value.generatedAt, "generated_at", 50);
  if (!Number.isFinite(Date.parse(generatedAt))) {
    throw new Error("generated_at_invalid");
  }

  return {
    schemaVersion: REPOSITORY_PACKET_SCHEMA_VERSION,
    projectId: safeString(value.projectId, "project_id", 100),
    repository: {
      provider: safeString(repository.provider, "repository_provider", 50),
      identifier: safeString(
        repository.identifier,
        "repository_identifier",
        300,
      ),
    },
    commitSha,
    branch: safeString(value.branch, "branch", 200),
    manifestHash,
    generatedAt: new Date(generatedAt).toISOString(),
    runner: {
      provider: safeString(runner.provider, "runner_provider", 100),
      runId: runner.runId === undefined
        ? undefined
        : safeString(runner.runId, "runner_id", 200),
      detailsUrl: safeUrl(runner.detailsUrl),
    },
    checks,
    capabilities,
  };
}

/**
 * Raw-body, HMAC-authenticated endpoint for repo-local runners. Only the
 * hardcoded sanitized packet shape is retained. Unknown fields are discarded.
 */
export async function handleRepositoryVerificationIngest(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const body = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(req.body ?? "");
    if (body.length === 0 || body.length > 512_000) {
      return res.status(400).json({ error: "invalid_body_size" });
    }

    const projectSlug = safeString(
      req.header("x-control-room-project"),
      "project_header",
      100,
    );
    const deliveryId = safeString(
      req.header("x-control-room-delivery"),
      "delivery_header",
      200,
    );
    const signature = safeString(
      req.header("x-control-room-signature"),
      "signature_header",
      100,
    );
    const project = await loadProject(projectSlug);
    if (!project) {
      return res.status(404).json({ error: "project_not_registered" });
    }

    if (!verifySignature(body, signature, secretForProject(projectSlug))) {
      return res.status(401).json({ error: "invalid_signature" });
    }

    const packet = parsePacket(JSON.parse(body.toString("utf8")));
    if (packet.projectId !== project.slug) {
      return res.status(409).json({ error: "project_identity_mismatch" });
    }
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
