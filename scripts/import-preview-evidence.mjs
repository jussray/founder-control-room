#!/usr/bin/env node

/**
 * Imports one sanitized manual preview packet into Founder Control Room.
 *
 * Guarantees:
 * - registry identity is verified before any write;
 * - evidence is always unsigned/manual preview;
 * - source code and usage-marker text are not accepted;
 * - no mission, repository write, merge, deploy, secret action, or paid action;
 * - existing findings are never resolved implicitly. Resolution requires an
 *   explicit fingerprint in resolvedFindingFingerprints.
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
const CHECK_STATUSES = new Set([
  "passed",
  "failed",
  "skipped",
  "pending",
  "cancelled",
]);
const CLAIMED_STATUSES = new Set(["active", "planned", "retired"]);
const OBSERVED_STATUSES = new Set([
  "verified",
  "drifted",
  "unverified",
  "retired",
]);
const RUN_STATUSES = new Set(["passed", "warning", "failed"]);
const FINDING_CATEGORIES = new Set([
  "manifest",
  "check",
  "capability",
  "runtime",
  "provider",
]);
const SEVERITIES = new Set(["low", "medium", "high", "critical"]);
const RISK_LEVELS = new Set(["low", "medium", "high"]);

function fail(message) {
  throw new Error(message);
}

function object(value, field) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${field} must be an object`);
  }
  return value;
}

function string(value, field, max = 500) {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    fail(`${field} must be a non-empty string of at most ${max} characters`);
  }
  return value.trim();
}

function optionalString(value, field, max = 1000) {
  if (value === undefined || value === null || value === "") return null;
  return string(value, field, max);
}

function enumValue(value, field, allowed) {
  const candidate = string(value, field, 100);
  if (!allowed.has(candidate)) fail(`${field} has unsupported value: ${candidate}`);
  return candidate;
}

function stringList(value, field, itemMax = 100) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 200) {
    fail(`${field} must be an array with at most 200 items`);
  }
  const values = value.map((item, index) =>
    string(item, `${field}[${index}]`, itemMax));
  if (new Set(values).size !== values.length) fail(`${field} contains duplicates`);
  return values;
}

function repositoryPath(value, field) {
  const candidate = string(value, field, 500);
  if (
    candidate.startsWith("/")
    || candidate.includes("\\")
    || candidate.split("/").includes("..")
  ) {
    fail(`${field} must be a safe repository-relative path`);
  }
  return candidate;
}

function pathList(value, field) {
  return stringList(value, field, 500).map((item, index) =>
    repositoryPath(item, `${field}[${index}]`));
}

function timestamp(value, field) {
  const candidate = string(value, field, 60);
  const parsed = Date.parse(candidate);
  if (!Number.isFinite(parsed)) fail(`${field} must be an ISO timestamp`);
  return new Date(parsed).toISOString();
}

function parsePacket(raw) {
  const packet = object(raw, "packet");
  if (packet.schemaVersion !== "1.0") fail("schemaVersion must equal 1.0");

  const repository = object(packet.repository, "repository");
  const manifest = object(packet.manifest, "manifest");
  const buildAssist = packet.buildAssist === undefined
    ? { enabled: false }
    : object(packet.buildAssist, "buildAssist");

  const commitSha = string(packet.commitSha, "commitSha", 64).toLowerCase();
  if (!/^[a-f0-9]{7,64}$/.test(commitSha)) fail("commitSha must be hexadecimal");

  const manifestKind = enumValue(
    manifest.kind,
    "manifest.kind",
    new Set(["github_blob_sha", "sha256"]),
  );
  const manifestValue = string(manifest.value, "manifest.value", 64).toLowerCase();
  const expectedLength = manifestKind === "github_blob_sha" ? 40 : 64;
  if (!new RegExp(`^[a-f0-9]{${expectedLength}}$`).test(manifestValue)) {
    fail(`manifest.value must be ${expectedLength} hexadecimal characters`);
  }

  if (typeof buildAssist.enabled !== "boolean") {
    fail("buildAssist.enabled must be boolean");
  }
  const preferredBuilder = optionalString(
    buildAssist.preferredBuilder,
    "buildAssist.preferredBuilder",
    100,
  );
  const riskLevel = buildAssist.riskLevel === undefined
    ? "medium"
    : enumValue(buildAssist.riskLevel, "buildAssist.riskLevel", RISK_LEVELS);

  if (!Array.isArray(packet.checks) || packet.checks.length > 200) {
    fail("checks must be an array with at most 200 items");
  }
  const checks = packet.checks.map((rawCheck, index) => {
    const check = object(rawCheck, `checks[${index}]`);
    return {
      id: string(check.id, `checks[${index}].id`, 100),
      name: string(check.name, `checks[${index}].name`, 200),
      required: check.required !== false,
      status: enumValue(
        check.status,
        `checks[${index}].status`,
        CHECK_STATUSES,
      ),
      ...(optionalString(check.reason, `checks[${index}].reason`, 500)
        ? { reason: optionalString(check.reason, `checks[${index}].reason`, 500) }
        : {}),
    };
  });

  if (!Array.isArray(packet.capabilities) || packet.capabilities.length > 200) {
    fail("capabilities must be an array with at most 200 items");
  }
  const capabilities = packet.capabilities.map((rawCapability, index) => {
    const capability = object(rawCapability, `capabilities[${index}]`);
    const usageAssertionIds = stringList(
      capability.usageAssertionIds,
      `capabilities[${index}].usageAssertionIds`,
    );
    const failedUsageAssertionIds = stringList(
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
      id: string(capability.id, `capabilities[${index}].id`, 100),
      claimedStatus: enumValue(
        capability.claimedStatus,
        `capabilities[${index}].claimedStatus`,
        CLAIMED_STATUSES,
      ),
      observedStatus: enumValue(
        capability.observedStatus,
        `capabilities[${index}].observedStatus`,
        OBSERVED_STATUSES,
      ),
      evidencePaths: pathList(
        capability.evidencePaths,
        `capabilities[${index}].evidencePaths`,
      ),
      missingEvidencePaths: pathList(
        capability.missingEvidencePaths,
        `capabilities[${index}].missingEvidencePaths`,
      ),
      requiredSignalIds: stringList(
        capability.requiredSignalIds,
        `capabilities[${index}].requiredSignalIds`,
      ),
      failedSignalIds: stringList(
        capability.failedSignalIds,
        `capabilities[${index}].failedSignalIds`,
      ),
      usageAssertionIds,
      failedUsageAssertionIds,
      reason: optionalString(
        capability.reason,
        `capabilities[${index}].reason`,
        1000,
      ),
    };
  });

  const rawFindings = packet.findings ?? [];
  if (!Array.isArray(rawFindings) || rawFindings.length > 200) {
    fail("findings must be an array with at most 200 items");
  }
  const findings = rawFindings.map((rawFinding, index) => {
    const finding = object(rawFinding, `findings[${index}]`);
    return {
      fingerprint: string(
        finding.fingerprint,
        `findings[${index}].fingerprint`,
        200,
      ),
      category: enumValue(
        finding.category,
        `findings[${index}].category`,
        FINDING_CATEGORIES,
      ),
      severity: enumValue(
        finding.severity,
        `findings[${index}].severity`,
        SEVERITIES,
      ),
      title: string(finding.title, `findings[${index}].title`, 300),
      detail: optionalString(finding.detail, `findings[${index}].detail`, 2000),
      suggestedAction: optionalString(
        finding.suggestedAction,
        `findings[${index}].suggestedAction`,
        2000,
      ),
    };
  });

  const resolvedFindingFingerprints = stringList(
    packet.resolvedFindingFingerprints,
    "resolvedFindingFingerprints",
    200,
  );
  const activeFingerprints = new Set(findings.map((finding) => finding.fingerprint));
  for (const fingerprint of resolvedFindingFingerprints) {
    if (activeFingerprints.has(fingerprint)) {
      fail(`finding ${fingerprint} cannot be both active and resolved`);
    }
  }

  return {
    schemaVersion: "1.0",
    projectId: string(packet.projectId, "projectId", 100),
    repository: {
      provider: string(repository.provider, "repository.provider", 50),
      identifier: string(repository.identifier, "repository.identifier", 300),
    },
    branch: string(packet.branch, "branch", 200),
    commitSha,
    manifest: {
      kind: manifestKind,
      value: manifestValue,
      path: repositoryPath(
        manifest.path ?? ".control-room/repository.manifest.json",
        "manifest.path",
      ),
    },
    generatedAt: timestamp(packet.generatedAt, "generatedAt"),
    overallStatus: enumValue(
      packet.overallStatus,
      "overallStatus",
      RUN_STATUSES,
    ),
    evidence: string(packet.evidence, "evidence", 1000),
    buildAssist: {
      enabled: buildAssist.enabled,
      preferredBuilder,
      riskLevel,
    },
    checks,
    capabilities,
    findings,
    resolvedFindingFingerprints,
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
  let payload = null;
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = raw;
    }
  }
  if (!response.ok) {
    const detail = typeof payload === "object"
      ? payload?.message ?? payload?.error ?? JSON.stringify(payload)
      : payload;
    fail(`Supabase ${response.status}: ${detail}`);
  }
  return payload;
}

function filterValue(value) {
  return encodeURIComponent(value);
}

const packet = parsePacket(
  JSON.parse(await readFile(resolve(packetPath), "utf8")),
);
const projectRows = await api(
  `/projects?slug=eq.${filterValue(packet.projectId)}&select=id,slug,name,repo_provider,repo_identifier&limit=1`,
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
  `/project_manifests?project_id=eq.${filterValue(project.id)}&superseded_at=is.null`,
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

for (const fingerprint of packet.resolvedFindingFingerprints) {
  await api(
    `/repository_findings?project_id=eq.${filterValue(project.id)}&fingerprint=eq.${filterValue(fingerprint)}&status=eq.open`,
    {
      method: "PATCH",
      body: JSON.stringify({
        status: "resolved",
        resolved_at: now,
        last_seen_at: now,
      }),
    },
  );
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
  findingsOpenedOrUpdated: packet.findings.length,
  findingsExplicitlyResolved: packet.resolvedFindingFingerprints.length,
  missionsCreated: 0,
}, null, 2));
