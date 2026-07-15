import { createHash } from "node:crypto";
import type { RepositoryProvider, VerificationSignal } from "../providers/RepositoryProvider.js";
import {
  REPOSITORY_MANIFEST_PATH,
  REPOSITORY_MANIFEST_SCHEMA_VERSION,
  type CapabilityDeclaration,
  type CapabilityObservation,
  type CheckObservation,
  type ManifestValidationResult,
  type RepositoryManifest,
  type RepositoryManifestInspection,
  type RequiredSignalDeclaration,
} from "../types/repositoryVerification.js";

export interface RegistryProjectIdentity {
  slug: string;
  repo_provider: string;
  repo_identifier: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(nonEmptyString);
}

function unique(values: string[]): boolean {
  return new Set(values).size === values.length;
}

function parseRequiredSignals(value: unknown, errors: string[]): RequiredSignalDeclaration[] {
  if (!Array.isArray(value)) {
    errors.push("verification.requiredSignals must be an array");
    return [];
  }

  const signals: RequiredSignalDeclaration[] = [];
  value.forEach((candidate, index) => {
    if (!isRecord(candidate)) {
      errors.push(`verification.requiredSignals[${index}] must be an object`);
      return;
    }
    if (!nonEmptyString(candidate.id)) {
      errors.push(`verification.requiredSignals[${index}].id is required`);
      return;
    }
    if (!nonEmptyString(candidate.name)) {
      errors.push(`verification.requiredSignals[${index}].name is required`);
      return;
    }
    if (candidate.required !== undefined && typeof candidate.required !== "boolean") {
      errors.push(`verification.requiredSignals[${index}].required must be boolean`);
      return;
    }
    signals.push({
      id: candidate.id,
      name: candidate.name,
      required: candidate.required ?? true,
    });
  });

  if (!unique(signals.map((signal) => signal.id))) {
    errors.push("verification.requiredSignals ids must be unique");
  }
  return signals;
}

function parseCapabilities(
  value: unknown,
  signalIds: Set<string>,
  errors: string[],
): CapabilityDeclaration[] {
  if (!Array.isArray(value)) {
    errors.push("capabilities must be an array");
    return [];
  }

  const capabilities: CapabilityDeclaration[] = [];
  value.forEach((candidate, index) => {
    if (!isRecord(candidate)) {
      errors.push(`capabilities[${index}] must be an object`);
      return;
    }
    if (!nonEmptyString(candidate.id)) {
      errors.push(`capabilities[${index}].id is required`);
      return;
    }
    if (!nonEmptyString(candidate.description)) {
      errors.push(`capabilities[${index}].description is required`);
      return;
    }
    if (!["active", "planned", "retired"].includes(String(candidate.status))) {
      errors.push(`capabilities[${index}].status must be active, planned, or retired`);
      return;
    }
    if (!stringArray(candidate.evidencePaths)) {
      errors.push(`capabilities[${index}].evidencePaths must be a string array`);
      return;
    }
    const requiredSignals = candidate.requiredSignals ?? [];
    if (!stringArray(requiredSignals)) {
      errors.push(`capabilities[${index}].requiredSignals must be a string array`);
      return;
    }
    for (const signalId of requiredSignals) {
      if (!signalIds.has(signalId)) {
        errors.push(`capabilities[${index}] references unknown signal "${signalId}"`);
      }
    }
    capabilities.push({
      id: candidate.id,
      description: candidate.description,
      status: candidate.status as CapabilityDeclaration["status"],
      evidencePaths: candidate.evidencePaths,
      requiredSignals,
    });
  });

  if (!unique(capabilities.map((capability) => capability.id))) {
    errors.push("capability ids must be unique");
  }
  return capabilities;
}

export function parseRepositoryManifest(
  raw: string,
  expected: RegistryProjectIdentity,
): ManifestValidationResult {
  const errors: string[] = [];
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    return { valid: false, errors: ["manifest is not valid JSON"], manifest: null };
  }

  if (!isRecord(decoded)) {
    return { valid: false, errors: ["manifest root must be an object"], manifest: null };
  }

  if (decoded.schemaVersion !== REPOSITORY_MANIFEST_SCHEMA_VERSION) {
    errors.push(`schemaVersion must equal ${REPOSITORY_MANIFEST_SCHEMA_VERSION}`);
  }
  if (decoded.projectId !== expected.slug) {
    errors.push(`projectId must equal registry slug "${expected.slug}"`);
  }

  const repository = decoded.repository;
  if (!isRecord(repository)) {
    errors.push("repository must be an object");
  } else {
    if (repository.provider !== expected.repo_provider) {
      errors.push(`repository.provider must equal "${expected.repo_provider}"`);
    }
    if (repository.identifier !== expected.repo_identifier) {
      errors.push(`repository.identifier must equal "${expected.repo_identifier}"`);
    }
    if (!nonEmptyString(repository.defaultBranch)) {
      errors.push("repository.defaultBranch is required");
    }
  }

  const verification = decoded.verification;
  const requiredSignals = isRecord(verification)
    ? parseRequiredSignals(verification.requiredSignals, errors)
    : (errors.push("verification must be an object"), []);

  const capabilities = parseCapabilities(
    decoded.capabilities,
    new Set(requiredSignals.map((signal) => signal.id)),
    errors,
  );

  const privacy = decoded.privacy;
  if (!isRecord(privacy)) {
    errors.push("privacy must be an object");
  } else {
    if (!stringArray(privacy.allowlistedPacketFields)) {
      errors.push("privacy.allowlistedPacketFields must be a string array");
    }
    if (!stringArray(privacy.forbiddenData)) {
      errors.push("privacy.forbiddenData must be a string array");
    }
  }

  const buildAssist = decoded.buildAssist;
  if (buildAssist !== undefined && !isRecord(buildAssist)) {
    errors.push("buildAssist must be an object when present");
  } else if (isRecord(buildAssist)) {
    if (typeof buildAssist.enabled !== "boolean") {
      errors.push("buildAssist.enabled must be boolean");
    }
    if (buildAssist.preferredBuilder !== undefined && !nonEmptyString(buildAssist.preferredBuilder)) {
      errors.push("buildAssist.preferredBuilder must be a non-empty string");
    }
    if (
      buildAssist.riskLevel !== undefined
      && !["low", "medium", "high"].includes(String(buildAssist.riskLevel))
    ) {
      errors.push("buildAssist.riskLevel must be low, medium, or high");
    }
  }

  if (errors.length > 0 || !isRecord(repository) || !isRecord(privacy)) {
    return { valid: false, errors, manifest: null };
  }

  const manifest: RepositoryManifest = {
    schemaVersion: REPOSITORY_MANIFEST_SCHEMA_VERSION,
    projectId: decoded.projectId as string,
    repository: {
      provider: repository.provider as string,
      identifier: repository.identifier as string,
      defaultBranch: repository.defaultBranch as string,
    },
    verification: { requiredSignals },
    capabilities,
    buildAssist: isRecord(buildAssist)
      ? {
          enabled: buildAssist.enabled as boolean,
          preferredBuilder: buildAssist.preferredBuilder as string | undefined,
          riskLevel: buildAssist.riskLevel as "low" | "medium" | "high" | undefined,
        }
      : undefined,
    privacy: {
      allowlistedPacketFields: privacy.allowlistedPacketFields as string[],
      forbiddenData: privacy.forbiddenData as string[],
    },
  };

  return { valid: true, errors: [], manifest };
}

function latestSignalsByName(signals: VerificationSignal[]): Map<string, VerificationSignal> {
  const result = new Map<string, VerificationSignal>();
  for (const signal of signals) {
    const current = result.get(signal.name);
    const currentTime = Date.parse(current?.completedAt ?? current?.startedAt ?? "") || 0;
    const candidateTime = Date.parse(signal.completedAt ?? signal.startedAt ?? "") || 0;
    if (!current || candidateTime >= currentTime) result.set(signal.name, signal);
  }
  return result;
}

function checkObservations(
  declarations: RequiredSignalDeclaration[],
  signals: VerificationSignal[],
): CheckObservation[] {
  const byName = latestSignalsByName(signals);
  return declarations.map((declaration) => {
    const signal = byName.get(declaration.name) ?? null;
    return {
      id: declaration.id,
      name: declaration.name,
      required: declaration.required ?? true,
      status: signal?.status ?? "missing",
      signal,
    };
  });
}

async function inspectEvidencePaths(
  provider: RepositoryProvider,
  projectId: string,
  commitSha: string,
  paths: string[],
): Promise<Map<string, boolean>> {
  const observations = new Map<string, boolean>();
  await Promise.all(
    [...new Set(paths)].map(async (path) => {
      try {
        await provider.readFile(projectId, commitSha, path);
        observations.set(path, true);
      } catch {
        observations.set(path, false);
      }
    }),
  );
  return observations;
}

function capabilityObservations(
  declarations: CapabilityDeclaration[],
  checks: CheckObservation[],
  pathObservations: Map<string, boolean>,
): CapabilityObservation[] {
  const checksById = new Map(checks.map((check) => [check.id, check]));

  return declarations.map((capability) => {
    if (capability.status === "retired") {
      return {
        id: capability.id,
        claimedStatus: capability.status,
        observedStatus: "retired",
        evidencePaths: capability.evidencePaths,
        missingEvidencePaths: [],
        requiredSignalIds: capability.requiredSignals ?? [],
        failedSignalIds: [],
        reason: null,
      };
    }

    const missingEvidencePaths = capability.evidencePaths.filter(
      (path) => pathObservations.get(path) !== true,
    );
    const requiredSignalIds = capability.requiredSignals ?? [];
    const signalObservations = requiredSignalIds.map((id) => checksById.get(id));
    const failedSignalIds = requiredSignalIds.filter((id) => {
      const check = checksById.get(id);
      return !check || ["missing", "failed", "cancelled", "skipped"].includes(check.status);
    });
    const pendingSignal = signalObservations.some(
      (check) => check && ["queued", "running", "unknown"].includes(check.status),
    );

    if (capability.status === "planned") {
      return {
        id: capability.id,
        claimedStatus: capability.status,
        observedStatus: "unverified",
        evidencePaths: capability.evidencePaths,
        missingEvidencePaths,
        requiredSignalIds,
        failedSignalIds,
        reason: "capability is declared as planned",
      };
    }

    if (missingEvidencePaths.length > 0 || failedSignalIds.length > 0) {
      const reasons = [
        missingEvidencePaths.length > 0
          ? `missing evidence: ${missingEvidencePaths.join(", ")}`
          : null,
        failedSignalIds.length > 0
          ? `failed or missing signals: ${failedSignalIds.join(", ")}`
          : null,
      ].filter(Boolean);
      return {
        id: capability.id,
        claimedStatus: capability.status,
        observedStatus: "drifted",
        evidencePaths: capability.evidencePaths,
        missingEvidencePaths,
        requiredSignalIds,
        failedSignalIds,
        reason: reasons.join("; "),
      };
    }

    if (pendingSignal) {
      return {
        id: capability.id,
        claimedStatus: capability.status,
        observedStatus: "unverified",
        evidencePaths: capability.evidencePaths,
        missingEvidencePaths,
        requiredSignalIds,
        failedSignalIds,
        reason: "required verification is still pending",
      };
    }

    return {
      id: capability.id,
      claimedStatus: capability.status,
      observedStatus: "verified",
      evidencePaths: capability.evidencePaths,
      missingEvidencePaths,
      requiredSignalIds,
      failedSignalIds,
      reason: null,
    };
  });
}

function overallStatus(
  validation: ManifestValidationResult,
  checks: CheckObservation[],
  capabilities: CapabilityObservation[],
): RepositoryManifestInspection["overallStatus"] {
  if (!validation.valid) return "failed";
  if (
    checks.some(
      (check) => check.required && ["missing", "failed", "cancelled", "skipped"].includes(check.status),
    )
    || capabilities.some((capability) => capability.observedStatus === "drifted")
  ) {
    return "failed";
  }
  if (
    checks.some((check) => check.required && check.status !== "passed")
    || capabilities.some((capability) => capability.observedStatus === "unverified")
  ) {
    return "warning";
  }
  return "passed";
}

export async function inspectRepositoryManifest(
  provider: RepositoryProvider,
  project: RegistryProjectIdentity,
): Promise<RepositoryManifestInspection> {
  const live = await provider.getProject(project.slug);
  const branch = live.defaultBranch;
  const ref = await provider.getRef(project.slug, branch);
  let raw = "";
  let validation: ManifestValidationResult;

  try {
    raw = await provider.readFile(project.slug, ref.commitSha, REPOSITORY_MANIFEST_PATH);
    validation = parseRepositoryManifest(raw, project);
  } catch (error) {
    validation = {
      valid: false,
      errors: [
        `${REPOSITORY_MANIFEST_PATH} is missing or unreadable: ${error instanceof Error ? error.message : String(error)}`,
      ],
      manifest: null,
    };
  }

  const signals = await provider.listVerificationSignals(project.slug, ref.commitSha);
  const checks = validation.manifest
    ? checkObservations(validation.manifest.verification.requiredSignals, signals)
    : [];
  const evidencePaths = validation.manifest
    ? validation.manifest.capabilities.flatMap((capability) => capability.evidencePaths)
    : [];
  const paths = await inspectEvidencePaths(provider, project.slug, ref.commitSha, evidencePaths);
  const capabilities = validation.manifest
    ? capabilityObservations(validation.manifest.capabilities, checks, paths)
    : [];

  return {
    manifestPath: REPOSITORY_MANIFEST_PATH,
    manifestHash: createHash("sha256").update(raw).digest("hex"),
    commitSha: ref.commitSha,
    branch,
    validation,
    checks,
    capabilities,
    overallStatus: overallStatus(validation, checks, capabilities),
    scannedAt: new Date().toISOString(),
  };
}
