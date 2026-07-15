#!/usr/bin/env node

/**
 * Import a sanitized founder-reviewed preview evidence packet into the
 * standalone Founder Control Room Supabase project.
 *
 * This is a temporary/manual bridge for repositories whose Worker or private
 * GitHub-hosted runner is not yet available. It never marks evidence signed,
 * never stores source/marker text, never creates a mission, and never performs
 * repository writes.
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const [packetPath] = process.argv.slice(2);
if (!packetPath) {
  console.error("Usage: npm run preview:evidence -- <packet.json>");
  process.exit(2);
}

const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  process.exit(2);
}

const REST_URL = `${SUPABASE_URL}/rest/v1`;
const ALLOWED_CHECK_STATUSES = new Set([
  "passed",
  "failed",
  "skipped",
  "pending",
  "cancelled",
]);
const ALLOWED_CLAIMED_STATUSES = new Set(["active", "planned", "retired"]);
const ALLOWED_OBSERVED_STATUSES = new Set([
  "verified",
  "drifted",
  "unverified",
  "retired",
]);
const ALLOWED_RUN_STATUSES = new Set(["passed", "warning", "failed"]);
const ALLOWED_FINDING_CATEGORIES = new Set([
  "manifest",
  "check",
  "capability",
  "runtime",
  "provider",
]);
const ALLOWED_SEVERITIES = new Set(["low", "medium", "high", "critical"]);

function fail(message) {
  throw new Error(message);
}

function record(value, field) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${field} must be an object`);
  }
  return value;
}

function text(value, field, max = 500) {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    fail(`${field} must be a non-empty string of at most ${max} characters`);
  }
  return value.trim();
}

function optionalText(value, field, max = 1000) {
  if (value === undefined || value === null || value === "") return null;
  return text(value, field, max);
}

function safePath(value, field) {
  const candidate = text(value, field, 500);
  if (
    candidate.startsWith("/")
    || candidate.includes("\\")
    || candidate.split("/").includes("..")
  ) {
    fail(`${field} must be a safe repository-relative path`);
  }
  return candidate;
}

function idList(value, field) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 200) {
    fail(`${field} must be an array with at most 200 items`);
  }
  const result = value.map((item, index) => text(item, `${field}[${index}]`, 100));
  if (new Set(result).size !== result.length) fail(`${field} contains duplicates`);
  return result;
}

function pathList(value, field) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 200) {
    fail(`${field} must be an array with at most 200 items`);
  }
  const result = value.map((item, index) => safePath(item, `${field}[${index}]`));
  if (new Set(result).size !== result.length) fail(`${field} contains duplicates`);
  return result;
}

function isoTimestamp(value, field) {
  const candidate = text(value, field, 60);
  const timestamp = Date.parse(candidate);
  if (!Number.isFinite(timestamp)) fail(`${field} must be an ISO timestamp`);
  return new Date(timestamp).toISOString();
}

function enumValue(value, field, allowed) {
  const candidate = text(value, field, 100);
  if (!allowed.has(candidate)) fail(`${field} has unsupported value: ${candidate}`);
  return candidate;
}

function parsePacket(raw) {
  const packet = record(raw, "packet");
  if (packet.schemaVersion !== "1.0") fail("schemaVersion must equal 1.0");

  const repository = record(packet.repository, "repository");
  const manifest = record(packet.manifest, "manifest");
  const buildAssist = packet.buildAssist === undefined
    ? { enabled: false }
    : record(packet.buildAssist, "buildAssist");

  const commitSha = text(packet.commitSha, "commitSha", 64).toLowerCase();
  if (!/^[a-f0-9]{7,64}$/.test(commitSha)) fail("commitSha must be hexadecimal");
  const manifestValue = text(manifest.value, "manifest.value", 100).toLowerCase();
  if (!/^[a-f0-9]{40,64}$/.test(manifestValue)) {
    fail("manifest.value must be a GitHub blob SHA or SHA-256 hex digest");
  }
  const manifestKind = enumValue(
    manifest.kind,
    "manifest.kind",
    new Set(["github_blob_sha", "sha256"]),
  );

  const checksRaw = Array.isArray(packet.checks) ? packet.checks : fail("checks must be an array");
  if (checksRaw.length > 200) fail("checks has more than 200 items");
  const checks = checksRaw.map((item, index) => {
    const check = record(item, `checks[${index}]`);
    return {
      id: text(check.id, `checks[${index}].id`, 100),
      name: text(check.name, `checks[${index}].name`, 200),
      required: check.required !== false,
      status: enumValue(
        check.status,
        `checks[${index}].status`,
        ALLOWED_CHECK_STATUSES,
      ),
      ...(optionalText(check.reason, `checks[${index}].reason`, 500)
        ? { reason: optionalText(check.reason, `checks[${index}].reason`, 500) }
        : {}),
    };
  });

  const capabilitiesRaw = Array.isArray(packet.capabilities)
    ? packet.capabilities
    : fail("capabilities must be an array");
  if (capabilitiesRaw.length > 200) fail("capabilities has more than 200 items");
  const capabilities = capabilitiesRaw.map((item, index) => {
    const capability = record(item, `capabilities[${index}]`);
    const usageAssertionIds = idList(
      capability.usageAssertionIds,
      `capabilities[${index}].usageAssertionIds`,
    );
    const failedUsageAssertionIds = idList(
      capability.failedUsageAssertionIds,
      `capabilities[${index}].failedUsageAssertionIds`,
    );
    if (
      failedUsageAssertionIds.some(
        (assertionId) => !usageAssertionIds.includes(assertionId),
      )
    ) {
      fail(`capabilities[${index}] failed usage IDs must be declared usage IDs`);
    }
    return {
      id: text(capability.id, `capabilities[${index}].id`, 100),
      claimedStatus: enumValue(
        capability.claimedStatus,
        `capabilities[${index}].claimedStatus`,
        ALLOWED_CLAIMED_STATUSES,
      ),
      observedStatus: enumValue(
        capability.observedStatus,
        `capabilities[${index}].observedStatus`,
        ALLOWED_OBSERVED_STATUSES,
      ),
      evidencePaths: pathList(
        capability.evidencePaths,
        `capabilities[${index}].evidencePaths`,
      ),
      missingEvidencePaths: pathList(
        capability.missingEvidencePaths,
        `capabilities[${index}].missingEvidencePaths`,
      ),
      requiredSignalIds: idList(
        capability.requiredSignalIds,
        `capabilities[${index}].requiredSignalIds`,
      ),
      failedSignalIds: idList(
        capability.failedSignalIds,
        `capabilities[${index}].failedSignalIds`,
      ),
      usageAssertionIds,
      failedUsageAssertionIds,
      reason: optionalText(capability.reason, `capabilities[${index}].reason`, 1000),
    };
  });

  const findingsRaw = packet.findings === undefined ? [] : packet.findings;
  if (!Array.isArray(findingsRaw) || findingsRaw.length > 200) {
    fail("findings must be an array with at most 200 items");
  }
  const findings = findingsRaw.map((item, index) => {
    const finding = record(item, `findings[${index}]`);
    return {
      fingerprint: text(finding.fingerprint, `findings[${index}].fingerprint`, 200),
      category: enumValue(
        finding.category,
        `findings[${index}].category`,
        ALLOWED_FINDING_CATEGORIES,
      ),
      severity: enumValue(
        finding.severity,
        `findings[${index}].severity`,
        ALLOWED_SEVERITIES,
      ),
      title: text(finding.title, `findings[${index}].title`, 300),
      detail: optionalText(finding.detail, `findings[${index}].detail`, 2000),
      suggestedAction: optionalText(
        finding.suggestedAction,
        `findings[${index}].suggestedAction`,
        2000,
      ),
    };
  });

  if (typeof buildAssist.enabled !== "boolean") {
    fail("buildAssist.enabled must be boolean");
  }
  if (
    buildAssist.riskLevel !== undefined
    && !new Set(["low", "medium", "high"]).has(buildAssist.riskLevel)
  ) {
    fail("buildAssist.riskLevel must be low, medium, or high");
  }

  return {
    schemaVersion: "1.0",
    projectId: text(packet.projectId, "projectId", 100),
    repository: {
      provider: text(repository.provider, "repository.provider", 50),
      identifier: text(repository.identifier, "repository.identifier", 300),
    },
    branch: text(packet.branch, "branch", 200),
    commitSha,
    manifest: {
      kind: manifestKind,
      value: manifestValue,
      path: safePath(
        manifest.path ?? ".control-room/repository.manifest.json",
        "manifest.path",
      ),
    },
    generatedAt: isoTimestamp(packet.generatedAt, "generatedAt"),
    overallStatus: enumValue(
      packet.overallStatus,
      "overallStatus",
      ALLOWED_RUN_STATUSES,
    ),
    evidence: text(packet.evidence, "evidence", 1000),
    buildAssist: {
      enabled: buildAssist.enabled,
      preferredBuilder: optionalText(
        buildAssist.preferredBuilder,
        "buildAssist.preferredBuilder",
        100,
      ),
      riskLevel: buildAssist.riskLevel ?? "medium",
    },
    checks,
    capabilities,
    findings,
  };
}

async function api(path, options = {}) {
  const response = await fetch(`${REST_URL}${path}`, {
    ...options,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  const raw = await response.text();
  const payload = raw ? JSON.parse(raw) : null;
  if (!response.ok) {
    fail(`Supabase ${response.status}: ${payload?.message ?? payload?.error ?? raw}`);
  }
  return payload;
}

function eq(value) {
  return encodeURIComponent(value);
}

const packet = parsePacket(
  JSON.parse(await readFile(resolve(packetPath), "utf8")),
);

const projectRows = await api(
  `/projects?slug=eq.${eq(packet.projectId)}&select=id,slug,name,repo_provider,repo_identifier&limit=1`,
);
const project = projectRows?.[0];
if (!project) fail(`No registered project found for slug ${packet.projectId}`);
if (
  project.repo_provider !== packet.repository.provider
  || project.repo_identifier !== packet.repository.identifier
) {
  fail("Packet repository identity does not match the Control Room registry");
}

const manifestHash = `${packet.manifest.kind}:${packet.manifest.value}`;
const deliveryId = `manual-preview-${packet.projectId}-${packet.commitSha.slice(0, 12)}`;
const now = new Date().toISOString();

await api(
  `/project_manifests?project_id=eq.${eq(project.id)}&superseded_at=is.null`,
  {
    method: "PATCH",
    body: JSON.stringify({ superseded_at: packet.generatedAt }),
  },
);

await api(
  "/project_manifests?on_conflict=project_id,commit_sha,content_hash",
  {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      project_id: project.id,
      repository_provider: packet.repository.provider,
      repository_identifier: packet.repository.identifier,
      path: packet.manifest.path,
      commit_sha: packet.commitSha,
      content_hash: manifestHash,
      schema_version: packet.schemaVersion,
      parsed_manifest: {
        schemaVersion: packet.schemaVersion,
        projectId: packet.projectId,
        buildAssist: packet.buildAssist,
        manualPreview: true,
      },
      validation_status: "valid",
      validation_errors: [],
      default_branch: "main",
      imported_at: packet.generatedAt,
      observed_at: packet.generatedAt,
      superseded_at: null,
    }),
  },
);

const runRows = await api(
  "/repository_verification_runs?on_conflict=project_id,source,delivery_id&select=id",
  {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({
      project_id: project.id,
      source: "runner",
      delivery_id: deliveryId,
      repository_provider: packet.repository.provider,
      repository_identifier: packet.repository.identifier,
      branch: packet.branch,
      commit_sha: packet.commitSha,
      manifest_hash: manifestHash,
      overall_status: packet.overallStatus,
      checks: packet.checks,
      capabilities: packet.capabilities,
      runner: {
        provider: "founder_manual_audit",
        mode: "preview_branch_import",
        evidence: packet.evidence,
        manifestHashKind: packet.manifest.kind,
      },
      signature_verified: false,
      scanned_at: packet.generatedAt,
      received_at: now,
    }),
  },
);
const runId = runRows?.[0]?.id;
if (!runId) fail("Preview verification run was not returned");

for (const capability of packet.capabilities) {
  await api(
    "/repository_capability_evidence?on_conflict=project_id,capability_id",
    {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        project_id: project.id,
        capability_id: capability.id,
        claimed_status: capability.claimedStatus,
        observed_status: capability.observedStatus,
        evidence_paths: capability.evidencePaths,
        missing_evidence_paths: capability.missingEvidencePaths,
        required_signal_ids: capability.requiredSignalIds,
        failed_signal_ids: capability.failedSignalIds,
        usage_assertion_ids: capability.usageAssertionIds,
        failed_usage_assertion_ids: capability.failedUsageAssertionIds,
        reason: capability.reason,
        commit_sha: packet.commitSha,
        last_verified_at: packet.generatedAt,
        updated_at: now,
      }),
    },
  );
}

const activeFingerprints = packet.findings.map((finding) => finding.fingerprint);
for (const finding of packet.findings) {
  await api(
    "/repository_findings?on_conflict=project_id,fingerprint",
    {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        project_id: project.id,
        verification_run_id: runId,
        fingerprint: finding.fingerprint,
        category: finding.category,
        severity: finding.severity,
        status: "open",
        title: finding.title,
        detail: finding.detail,
        suggested_action: finding.suggestedAction,
        last_seen_at: now,
        resolved_at: null,
      }),
    },
  );
}

const existingOpen = await api(
  `/repository_findings?project_id=eq.${eq(project.id)}&status=eq.open&select=id,fingerprint`,
);
for (const finding of existingOpen ?? []) {
  if (activeFingerprints.includes(finding.fingerprint)) continue;
  await api(`/repository_findings?id=eq.${eq(finding.id)}`, {
    method: "PATCH",
    body: JSON.stringify({
      status: "resolved",
      resolved_at: now,
      last_seen_at: now,
    }),
  });
}

await api(
  "/project_events?on_conflict=project_id,source_event_id",
  {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify({
      project_id: project.id,
      source_event_id: `manual-preview:${packet.projectId}:${packet.commitSha.slice(0, 12)}`,
      event_type: `repository_preview_verification_${packet.overallStatus}`,
      severity: packet.overallStatus === "passed" ? "info" : "warning",
      provider: packet.repository.provider,
      decision: packet.overallStatus === "passed"
        ? "preview_verified"
        : "founder_attention_required",
      metadata: {
        source: "manual_preview_import",
        branch: packet.branch,
        commit_sha: packet.commitSha,
        manifest_hash: manifestHash,
        signature_verified: false,
        superseded_by_future_default_branch_scan: true,
      },
    }),
  },
);

console.log(JSON.stringify({
  imported: true,
  project: packet.projectId,
  branch: packet.branch,
  commitSha: packet.commitSha,
  overallStatus: packet.overallStatus,
  evidenceKind: "manual_preview",
  signatureVerified: false,
  runId,
  findings: packet.findings.length,
  missionsCreated: 0,
}, null, 2));
