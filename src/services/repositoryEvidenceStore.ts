import { supabase } from "../lib/supabaseClient.js";
import type {
  CapabilityObservation,
  CheckObservation,
  RepositoryManifestInspection,
  RepositoryVerificationPacket,
} from "../types/repositoryVerification.js";

export interface RegisteredProjectRow {
  id: string;
  slug: string;
  name: string;
  repo_provider: string;
  repo_identifier: string;
}

interface FindingInput {
  fingerprint: string;
  category: "manifest" | "check" | "capability" | "runtime" | "provider";
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  detail: string | null;
  suggestedAction: string;
}

function checkFindings(checks: CheckObservation[]): FindingInput[] {
  return checks
    .filter((check) => check.required && check.status !== "passed")
    .map((check) => ({
      fingerprint: `check:${check.id}`,
      category: "check" as const,
      severity: ["failed", "missing", "cancelled"].includes(check.status)
        ? "high" as const
        : "medium" as const,
      title: `${check.name} is not proven`,
      detail: `Required signal ${check.id} is ${check.status}.`,
      suggestedAction: `Inspect the ${check.name} workflow at the exact commit and prepare a repair mission.`,
    }));
}

function capabilityFindings(
  capabilities: CapabilityObservation[],
): FindingInput[] {
  return capabilities
    .filter((capability) => capability.observedStatus === "drifted")
    .map((capability) => ({
      fingerprint: `capability:${capability.id}`,
      category: "capability" as const,
      severity: "high" as const,
      title: `Capability ${capability.id} drifted from its code contract`,
      detail: capability.reason,
      suggestedAction: `Compare evidence paths, required checks, and code-usage assertions for ${capability.id}, then prepare a bounded repair mission.`,
    }));
}

function inspectionFindings(
  inspection: RepositoryManifestInspection,
): FindingInput[] {
  const manifestFindings = inspection.validation.valid
    ? []
    : [{
        fingerprint: "manifest:contract",
        category: "manifest" as const,
        severity: "high" as const,
        title: "Repository manifest is missing or invalid",
        detail: inspection.validation.errors.join("; "),
        suggestedAction: "Repair .control-room/repository.manifest.json before trusting capability claims.",
      }];
  return [
    ...manifestFindings,
    ...checkFindings(inspection.checks),
    ...capabilityFindings(inspection.capabilities),
  ];
}

async function syncFindings(
  project: RegisteredProjectRow,
  runId: string,
  findings: FindingInput[],
): Promise<void> {
  const now = new Date().toISOString();

  for (const finding of findings) {
    const { error } = await supabase
      .from("repository_findings")
      .upsert({
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
      }, { onConflict: "project_id,fingerprint" });
    if (error) throw new Error(`repository_finding_upsert_failed:${error.message}`);
  }

  const active = new Set(findings.map((finding) => finding.fingerprint));
  const { data: existing, error: existingError } = await supabase
    .from("repository_findings")
    .select("id,fingerprint,status")
    .eq("project_id", project.id)
    .in("category", ["manifest", "check", "capability"])
    .eq("status", "open");
  if (existingError) {
    throw new Error(`repository_finding_read_failed:${existingError.message}`);
  }

  for (const finding of existing ?? []) {
    if (active.has(String(finding.fingerprint))) continue;
    const { error } = await supabase
      .from("repository_findings")
      .update({ status: "resolved", resolved_at: now, last_seen_at: now })
      .eq("id", finding.id);
    if (error) throw new Error(`repository_finding_resolve_failed:${error.message}`);
  }
}

async function upsertCapabilities(
  project: RegisteredProjectRow,
  commitSha: string,
  scannedAt: string,
  capabilities: CapabilityObservation[],
): Promise<void> {
  for (const capability of capabilities) {
    const { error } = await supabase
      .from("repository_capability_evidence")
      .upsert({
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
        commit_sha: commitSha,
        last_verified_at: scannedAt,
        updated_at: new Date().toISOString(),
      }, { onConflict: "project_id,capability_id" });
    if (error) {
      throw new Error(`repository_capability_upsert_failed:${error.message}`);
    }
  }
}

export async function persistActiveInspection(
  project: RegisteredProjectRow,
  inspection: RepositoryManifestInspection,
): Promise<string> {
  const manifest = inspection.validation.manifest;

  const { error: supersedeError } = await supabase
    .from("project_manifests")
    .update({ superseded_at: inspection.scannedAt })
    .eq("project_id", project.id)
    .is("superseded_at", null);
  if (supersedeError) {
    throw new Error(`manifest_supersede_failed:${supersedeError.message}`);
  }

  const { error: manifestError } = await supabase
    .from("project_manifests")
    .upsert({
      project_id: project.id,
      repository_provider: project.repo_provider,
      repository_identifier: project.repo_identifier,
      path: inspection.manifestPath,
      commit_sha: inspection.commitSha,
      content_hash: inspection.manifestHash,
      schema_version: manifest?.schemaVersion ?? "unknown",
      parsed_manifest: manifest ?? {},
      validation_status: inspection.validation.valid ? "valid" : "invalid",
      validation_errors: inspection.validation.errors,
      default_branch: inspection.branch,
      imported_at: inspection.scannedAt,
      observed_at: inspection.scannedAt,
      superseded_at: null,
    }, { onConflict: "project_id,commit_sha,content_hash" });
  if (manifestError) throw new Error(`manifest_store_failed:${manifestError.message}`);

  const { data: run, error: runError } = await supabase
    .from("repository_verification_runs")
    .insert({
      project_id: project.id,
      source: "active_scan",
      repository_provider: project.repo_provider,
      repository_identifier: project.repo_identifier,
      branch: inspection.branch,
      commit_sha: inspection.commitSha,
      manifest_hash: inspection.manifestHash,
      overall_status: inspection.overallStatus,
      checks: inspection.checks,
      capabilities: inspection.capabilities,
      runner: { provider: project.repo_provider, mode: "control-room-active-scan" },
      signature_verified: true,
      scanned_at: inspection.scannedAt,
    })
    .select("id")
    .single();
  if (runError || !run) {
    throw new Error(`verification_run_store_failed:${runError?.message ?? "missing row"}`);
  }

  await upsertCapabilities(
    project,
    inspection.commitSha,
    inspection.scannedAt,
    inspection.capabilities,
  );
  await syncFindings(project, String(run.id), inspectionFindings(inspection));

  const { error: eventError } = await supabase.from("project_events").insert({
    project_id: project.id,
    source_event_id: `repo-scan:${inspection.commitSha}:${inspection.manifestHash}`,
    event_type: `repository_verification_${inspection.overallStatus}`,
    severity: inspection.overallStatus === "failed"
      ? "error"
      : inspection.overallStatus === "warning"
        ? "warning"
        : "info",
    provider: project.repo_provider,
    decision: inspection.overallStatus === "passed"
      ? "verified"
      : "attention_required",
    metadata: {
      commit_sha: inspection.commitSha,
      branch: inspection.branch,
      manifest_hash: inspection.manifestHash,
      failed_checks: inspection.checks
        .filter((check) => check.required && check.status !== "passed")
        .map((check) => check.id),
      drifted_capabilities: inspection.capabilities
        .filter((capability) => capability.observedStatus === "drifted")
        .map((capability) => capability.id),
      failed_usage_assertions: inspection.capabilities.flatMap(
        (capability) => capability.failedUsageAssertionIds.map(
          (assertionId) => `${capability.id}:${assertionId}`,
        ),
      ),
    },
  });
  if (eventError && eventError.code !== "23505") {
    throw new Error(`project_event_store_failed:${eventError.message}`);
  }

  return String(run.id);
}

function packetOverallStatus(
  packet: RepositoryVerificationPacket,
): "passed" | "warning" | "failed" {
  if (
    packet.checks.some(
      (check) => check.required && ["failed", "cancelled"].includes(check.status),
    )
    || packet.capabilities.some(
      (capability) => capability.observedStatus === "drifted",
    )
  ) return "failed";
  if (
    packet.checks.some((check) => check.required && check.status !== "passed")
    || packet.capabilities.some(
      (capability) => capability.observedStatus === "unverified",
    )
  ) return "warning";
  return "passed";
}

export async function persistRepositoryPacket(
  project: RegisteredProjectRow,
  deliveryId: string,
  packet: RepositoryVerificationPacket,
): Promise<string> {
  const overallStatus = packetOverallStatus(packet);
  const capabilities: CapabilityObservation[] = packet.capabilities.map((capability) => ({
    id: capability.id,
    claimedStatus: capability.claimedStatus,
    observedStatus: capability.observedStatus,
    evidencePaths: capability.evidencePaths,
    missingEvidencePaths: [],
    requiredSignalIds: [],
    failedSignalIds: [],
    usageAssertionIds: capability.usageAssertionIds ?? [],
    failedUsageAssertionIds: capability.failedUsageAssertionIds ?? [],
    usageAssertions: [],
    reason: capability.reason ?? null,
  }));

  const { data: run, error: runError } = await supabase
    .from("repository_verification_runs")
    .upsert({
      project_id: project.id,
      source: "repo_ping",
      delivery_id: deliveryId,
      repository_provider: packet.repository.provider,
      repository_identifier: packet.repository.identifier,
      branch: packet.branch,
      commit_sha: packet.commitSha,
      manifest_hash: packet.manifestHash,
      overall_status: overallStatus,
      checks: packet.checks,
      capabilities: packet.capabilities,
      runner: packet.runner,
      signature_verified: true,
      scanned_at: packet.generatedAt,
    }, { onConflict: "project_id,source,delivery_id" })
    .select("id")
    .single();
  if (runError || !run) {
    throw new Error(`verification_packet_store_failed:${runError?.message ?? "missing row"}`);
  }

  await upsertCapabilities(project, packet.commitSha, packet.generatedAt, capabilities);

  const checkObservations: CheckObservation[] = packet.checks.map((check) => ({
    id: check.id,
    name: check.name,
    required: check.required,
    status: check.status === "pending" ? "running" : check.status,
    signal: null,
  }));
  await syncFindings(project, String(run.id), [
    ...checkFindings(checkObservations),
    ...capabilityFindings(capabilities),
  ]);

  const { error: eventError } = await supabase.from("project_events").insert({
    project_id: project.id,
    source_event_id: `repo-ping:${deliveryId}`,
    event_type: `repository_ping_${overallStatus}`,
    severity: overallStatus === "failed"
      ? "error"
      : overallStatus === "warning"
        ? "warning"
        : "info",
    provider: packet.runner.provider,
    decision: overallStatus === "passed" ? "verified" : "attention_required",
    metadata: {
      commit_sha: packet.commitSha,
      branch: packet.branch,
      manifest_hash: packet.manifestHash,
      runner_id: packet.runner.runId ?? null,
      runner_url: packet.runner.detailsUrl ?? null,
      failed_usage_assertions: packet.capabilities.flatMap(
        (capability) => (capability.failedUsageAssertionIds ?? []).map(
          (assertionId) => `${capability.id}:${assertionId}`,
        ),
      ),
    },
  });
  if (eventError && eventError.code !== "23505") {
    throw new Error(`repository_ping_event_failed:${eventError.message}`);
  }

  return String(run.id);
}
